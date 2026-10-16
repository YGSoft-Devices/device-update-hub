// File: /src/docker-deployment.ts | Version: 0.2.0
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chownSync, closeSync, fsyncSync, mkdirSync, openSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { z } from 'zod';
import { slug, targetSchema, version } from './contract.js';
import { atomicJson, type Deployment, type HubPackage } from './hub-update.js';
import { demand, syncDirectory } from './store.js';

const absolutePath = z.string().regex(/^\//).max(4096).refine((value) => !value.includes(',') && !value.includes('\0'), 'Unsafe mount path');
export const hostPolicySchema = z.strictObject({
  inbox: absolutePath, status: absolutePath, private_directory: absolutePath, public_key_file: absolutePath,
  compose_file: absolutePath, compose_project: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
  data_volume: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/),
  health_url: z.string().url().refine((value) => {
    const url = new URL(value);
    return ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname) && ['http:', 'https:'].includes(url.protocol)
      && url.pathname === '/health' && !url.username && !url.password && !url.search && !url.hash;
  }),
  target: targetSchema.refine((target) => target.device_type === 'hub-server' && target.os === 'linux' && target.hardware_revision === 'docker'),
  channel: slug, current_version: version,
  operation_timeout_seconds: z.number().int().min(60).max(86400).default(3600),
  backup_key_file: absolutePath.optional(), backup_config_directory: absolutePath.optional(),
}).refine((value) => Boolean(value.backup_key_file) === Boolean(value.backup_config_directory), 'Backup key and host configuration directory must be configured together');
export type HostPolicy = z.infer<typeof hostPolicySchema>;
export class DockerDeployment implements Deployment {
  private readonly override: string;
  constructor(private policy: HostPolicy) { this.override = join(policy.private_directory, 'deployment.json'); }
  private async docker(args: string[]): Promise<string> {
    const result = await promisify(execFile)('docker', args, { timeout: this.policy.operation_timeout_seconds * 1000, maxBuffer: 4 * 1024 * 1024 });
    return result.stdout.trim();
  }
  private compose(args: string[], override = false): Promise<string> {
    return this.docker(['compose', '--project-name', this.policy.compose_project, '--file', this.policy.compose_file,
      ...(override ? ['--file', this.override] : []), ...args]);
  }
  private async health(): Promise<{ version: string; database_schema: number; status: string }> {
    const result = await fetch(this.policy.health_url, { redirect: 'error', signal: AbortSignal.timeout(5000) });
    demand(result.ok, 503, 'unhealthy_hub', 'Hub is not healthy');
    return z.object({ version, database_schema: z.union([z.literal(2), z.literal(3)]), status: z.literal('ok') }).parse(await result.json());
  }
  async current() {
    const container = await this.compose(['ps', '-q', 'hub']);
    demand(/^[a-f0-9]{12,64}$/.test(container), 409, 'invalid_deployment', 'Exactly one running Hub container is required');
    const image = await this.docker(['inspect', '--format', '{{.Image}}', container]);
    demand(/^sha256:[a-f0-9]{64}$/.test(image), 409, 'invalid_deployment', 'Unexpected running image identity');
    const mounts = JSON.parse(await this.docker(['inspect', '--format', '{{json .Mounts}}', container])) as { Type: string; Name: string; Destination: string }[];
    demand(mounts.some((mount) => mount.Type === 'volume' && mount.Name === this.policy.data_volume && mount.Destination === '/var/lib/duh'),
      409, 'invalid_deployment', 'The configured persistent data volume must match the running container');
    const health = await this.health();
    return { version: health.version, image, database_schema: health.database_schema };
  }
  async load(path: string, metadata: HubPackage) {
    await this.docker(['load', '--input', path]);
    const image = JSON.parse(await this.docker(['image', 'inspect', '--format', '{{json .}}', metadata.image.id])) as { Id: string; Os: string; Architecture: string };
    demand(image.Id === metadata.image.id && image.Os === 'linux' && image.Architecture === metadata.target.architecture, 422, 'invalid_image', 'Loaded image identity/platform differs');
  }
  async stop() { await this.compose(['stop', '--timeout', '60', 'hub']); }
  private helper(image: string, directory: string, readOnlyData: boolean, command: string, args: string[]) {
    return this.docker(['run', '--rm', '--pull', 'never', '--network', 'none', '--read-only', '--user', '1000:1000', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
      '--mount', `type=volume,source=${this.policy.data_volume},target=/data${readOnlyData ? ',readonly' : ''}`,
      '--mount', `type=bind,source=${directory},target=/backup${readOnlyData ? '' : ',readonly'}`,
      '--entrypoint', command, image, ...args]);
  }
  async backup(directory: string, image: string) {
    const backup = join(directory, 'backup'); mkdirSync(backup, { mode: 0o700 }); chownSync(backup, 1000, 1000);
    await this.helper(image, backup, true, 'tar', ['-cpf', '/backup/data.tar', '-C', '/data', '.']);
    const descriptor = openSync(join(backup, 'data.tar'), 'r+');
    try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
    syncDirectory(backup); syncDirectory(directory);
    await this.helper(image, backup, true, 'tar', ['--compare', '--file', '/backup/data.tar', '--directory', '/data']);
  }
  async start(image: string) {
    demand(/^sha256:[a-f0-9]{64}$/.test(image), 422, 'invalid_image', 'Image must be pinned by immutable ID');
    atomicJson(this.override, { services: { hub: { image, pull_policy: 'never' } } });
    await this.compose(['up', '-d', '--no-build', '--pull', 'never', '--force-recreate', '--wait', '--wait-timeout', '90', 'hub'], true);
  }
  async healthy(expectedVersion: string, expectedSchema?: number): Promise<boolean> {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try { const health = await this.health(); if (health.version === expectedVersion && (expectedSchema === undefined || health.database_schema === expectedSchema)) return true; } catch {}
      await setTimeout(1000);
    }
    return false;
  }
  async restore(directory: string, image: string) {
    const backup = join(directory, 'backup');
    await this.helper(image, backup, false, 'node', ['-e', "const fs=require('node:fs'); for(const name of ['catalog.db','catalog.db-wal','catalog.db-shm']) fs.rmSync('/data/'+name,{force:true});"]);
    await this.helper(image, backup, false, 'tar', ['-xpf', '/backup/data.tar', '-C', '/data']);
  }
}