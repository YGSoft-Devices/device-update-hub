// File: /src/hub-update.ts | Version: 0.2.0
import { constants, chmodSync, closeSync, createReadStream, createWriteStream, existsSync, fstatSync, fsyncSync, mkdirSync, openSync, readSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createHash, createPublicKey, randomUUID, verify } from 'node:crypto';
import { dirname, join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import semver from 'semver';
import { z } from 'zod';
import { sameTarget, selectRelease, slug, targetSchema, version, type Principal, type Target } from './contract.js';
import { demand, Store, syncDirectory } from './store.js';

export const packageSchema = z.strictObject({
  schema_version: z.literal('1'), product: z.literal('device-update-hub'), version, channel: slug,
  target: targetSchema, database_schema: z.union([z.literal(2), z.literal(3)]),
  image: z.strictObject({ filename: z.literal('hub-image.tar'), size: z.number().int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/), id: z.string().regex(/^sha256:[a-f0-9]{64}$/) }),
});
export type HubPackage = z.infer<typeof packageSchema>;
export const updateRequestSchema = z.strictObject({ schema_version: z.literal('1'), job_id: z.uuid(), release_id: z.uuid(), version, requested_by: z.string().min(1).max(64) });
export const jobSchema = z.strictObject({ job_id: z.uuid(), release_id: z.uuid(), version, at: z.iso.datetime(),
  state: z.enum(['queued', 'verifying', 'stopping', 'backing_up', 'starting', 'rolling_back', 'succeeded', 'rolled_back', 'failed', 'recovery_required']),
  maintenance: z.boolean(), message: z.string().max(240) });
export type UpdateJob = z.infer<typeof jobSchema>;
export type HubUpdateOptions = { inbox: string; status: string; publicKey: string; target: Target; currentVersion: string; channel: string };
const packageFiles = ['hub-update.json', 'hub-update.sig', 'hub-image.tar'] as const;
const heartbeatSchema = z.strictObject({ schema_version: z.literal('1'), at: z.iso.datetime(), target: targetSchema, channel: slug, key_sha256: z.string().regex(/^[a-f0-9]{64}$/) });
function keyDigest(publicKey: string): string { return createHash('sha256').update(createPublicKey(publicKey).export({ type: 'spki', format: 'der' })).digest('hex'); }
export function readRegular(path: string, maximum = 65536): Buffer {
  const descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const stat = fstatSync(descriptor);
    demand(stat.isFile() && stat.size <= maximum, 422, 'invalid_package', 'Expected a bounded regular file');
    const buffer = Buffer.alloc(maximum + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const count = readSync(descriptor, buffer, offset, buffer.length - offset, null);
      if (!count) break;
      offset += count;
    }
    demand(offset <= maximum, 422, 'invalid_package', 'Metadata exceeds its size limit');
    return buffer.subarray(0, offset);
  } finally { closeSync(descriptor); }
}
export function atomicJson(path: string, value: unknown, mode = 0o600): void {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(value), { flag: 'wx', mode });
    chmodSync(temporary, mode);
    const descriptor = openSync(temporary, 'r+');
    try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
    renameSync(temporary, path);
    syncDirectory(dirname(path));
  } finally { rmSync(temporary, { force: true }); }
}
export function verifiedPackage(directory: string, publicKey: string, expected: { version: string; channel: string; target: Target }): HubPackage {
  const bytes = readRegular(join(directory, 'hub-update.json'));
  const key = createPublicKey(publicKey);
  demand(key.asymmetricKeyType === 'ed25519' && verify(null, bytes, key, readRegular(join(directory, 'hub-update.sig'), 64)), 422, 'invalid_signature', 'Package signature verification failed');
  const metadata = packageSchema.parse(JSON.parse(bytes.toString('utf8')));
  demand(metadata.version === expected.version && metadata.channel === expected.channel && sameTarget(metadata.target, expected.target)
    && (expected.channel !== 'stable' || semver.prerelease(metadata.version) === null),
    422, 'incompatible_package', 'Signed package does not match this deployment');
  return metadata;
}
export async function copyVerified(source: string, destination: string, expected: { size: number; sha256: string }): Promise<void> {
  const descriptor = openSync(source, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  const hash = createHash('sha256');
  let size = 0;
  try {
    const stat = fstatSync(descriptor);
    demand(stat.isFile() && stat.size === expected.size, 422, 'invalid_package', 'Artifact size differs');
    const counter = new Transform({ transform(chunk: Buffer, _encoding, callback) {
      size += chunk.length;
      if (size > expected.size) return callback(new Error('Artifact exceeds its declared size'));
      hash.update(chunk); callback(null, chunk);
    } });
    await pipeline(createReadStream('', { fd: descriptor, autoClose: false }), counter, createWriteStream(destination, { flags: 'wx', mode: 0o600 }));
    demand(size === expected.size && hash.digest('hex') === expected.sha256, 422, 'integrity_error', 'Artifact checksum differs');
    const output = openSync(destination, 'r+');
    try { fsyncSync(output); } finally { closeSync(output); }
  } catch (error) { rmSync(destination, { force: true }); throw error; }
  finally { closeSync(descriptor); }
}
export function readJob(status: string): UpdateJob | null {
  const path = join(status, 'current.json');
  return existsSync(path) ? jobSchema.parse(JSON.parse(readRegular(path).toString('utf8'))) : null;
}
export class HubUpdates {
  private preparing = false;
  constructor(readonly options: HubUpdateOptions, private store: Store) {
    targetSchema.parse(options.target); version.parse(options.currentVersion); slug.parse(options.channel);
    demand(createPublicKey(options.publicKey).asymmetricKeyType === 'ed25519', 500, 'invalid_update_key', 'An Ed25519 verification key is required');
    mkdirSync(options.inbox, { recursive: true, mode: 0o700 });
  }
  job(): UpdateJob | null {
    const status = readJob(this.options.status);
    const pending = readdirSync(this.options.inbox).find((name) => /^[a-f0-9-]{36}\.ready$/.test(name) && name !== `${status?.job_id}.ready`
      && !existsSync(join(this.options.status, `${name.slice(0, -6)}.json`)));
    if (pending) {
      const request = updateRequestSchema.parse(JSON.parse(readRegular(join(this.options.inbox, pending, 'request.json')).toString('utf8')));
      return { job_id: request.job_id, release_id: request.release_id, version: request.version, at: new Date().toISOString(), state: 'queued', maintenance: true, message: 'Waiting for host updater' };
    }
    return status;
  }
  maintenance(): boolean { try { return this.preparing || this.job()?.maintenance === true; } catch { return true; } }
  agentReady(): boolean {
    try {
      const heartbeat = heartbeatSchema.parse(JSON.parse(readRegular(join(this.options.status, 'agent.json')).toString('utf8')));
      const age = Date.now() - Date.parse(heartbeat.at);
      return age >= -5000 && age <= 30000 && sameTarget(heartbeat.target, this.options.target) && heartbeat.channel === this.options.channel && heartbeat.key_sha256 === keyDigest(this.options.publicKey);
    } catch { return false; }
  }
  check(principal: Principal) {
    const release = selectRelease(this.store.list(principal), { product: 'device-update-hub', current_version: this.options.currentVersion, channel: this.options.channel, target: this.options.target }, principal);
    return release ? { id: release.id, version: release.version, release_notes: release.release_notes } : null;
  }
  async enqueue(releaseId: string, confirmation: string, principal: Principal): Promise<UpdateJob> {
    const existing = this.job();
    if (existing?.release_id === releaseId && existing.maintenance) return existing;
    demand(this.agentReady(), 503, 'updater_unavailable', 'The trusted host updater is not ready');
    demand(!this.maintenance(), 409, 'update_busy', 'Another update requires attention');
    const release = this.store.get(releaseId, principal);
    demand(release.status === 'published' && release.product === 'device-update-hub' && release.channel === this.options.channel
      && semver.gt(release.version, this.options.currentVersion) && release.targets.some((target) => sameTarget(target, this.options.target))
      && confirmation === release.version && (release.channel !== 'stable' || semver.prerelease(release.version) === null), 409, 'invalid_update', 'Confirm an eligible published Hub release');
    demand(release.artifacts.length === packageFiles.length && packageFiles.every((name) => release.artifacts.some((artifact) => artifact.filename === name)), 422, 'invalid_package', 'Hub release must contain exactly the three package files');
    const jobId = randomUUID();
    const temporary = join(this.options.inbox, `${jobId}.partial`);
    this.preparing = true;
    try {
      await mkdir(temporary, { mode: 0o700 });
      for (const name of packageFiles) {
        const artifact = release.artifacts.find((entry) => entry.filename === name)!;
        if (name !== 'hub-image.tar') demand(artifact.size <= 65536, 422, 'invalid_package', 'Package metadata is too large');
        await copyVerified(this.store.artifactPath(artifact), join(temporary, name), artifact);
      }
      const metadata = verifiedPackage(temporary, this.options.publicKey, { version: release.version, channel: release.channel, target: this.options.target });
      const image = release.artifacts.find((artifact) => artifact.filename === 'hub-image.tar')!;
      demand(metadata.image.size === image.size && metadata.image.sha256 === image.sha256, 422, 'invalid_package', 'Signed image differs from the release');
      demand(this.store.get(release.id, principal).status === 'published', 409, 'withdrawn_release', 'Release was withdrawn');
      atomicJson(join(temporary, 'request.json'), { schema_version: '1', job_id: jobId, release_id: release.id, version: release.version, requested_by: principal.id });
      syncDirectory(temporary);
      this.store.audit(principal, 'hub.update_requested', jobId);
      renameSync(temporary, join(this.options.inbox, `${jobId}.ready`));
      syncDirectory(this.options.inbox);
      return this.job()!;
    } finally { this.preparing = false; rmSync(temporary, { recursive: true, force: true }); }
  }
}

export interface Deployment {
  current(): Promise<{ version: string; image: string; database_schema?: number }>;
  load(path: string, metadata: HubPackage): Promise<void>;
  stop(): Promise<void>;
  backup(directory: string, image: string): Promise<void>;
  start(image: string): Promise<void>;
  healthy(expectedVersion: string, expectedSchema?: number): Promise<boolean>;
  restore(directory: string, image: string): Promise<void>;
}
export class HostUpdater {
  private running = false;
  constructor(readonly options: HubUpdateOptions & { privateDirectory: string }, private deployment: Deployment) {
    mkdirSync(options.privateDirectory, { recursive: true, mode: 0o700 });
    mkdirSync(options.status, { recursive: true, mode: 0o755 });
    this.heartbeat();
  }
  heartbeat(): void {
    atomicJson(join(this.options.status, 'agent.json'), { schema_version: '1', at: new Date().toISOString(), target: this.options.target, channel: this.options.channel, key_sha256: keyDigest(this.options.publicKey) }, 0o644);
  }
  async once(): Promise<void> {
    if (this.running) return;
    this.heartbeat();
    this.running = true;
    try {
      const active = readJob(this.options.status);
      if (active?.maintenance) {
        atomicJson(join(this.options.status, 'current.json'), { ...active, state: 'recovery_required', message: 'Interrupted host update requires operator recovery', at: new Date().toISOString() }, 0o644);
        return;
      }
      for (const name of readdirSync(this.options.inbox).filter((entry) => /^[a-f0-9-]{36}\.ready$/.test(entry)).sort()) {
        const jobId = z.uuid().parse(name.slice(0, -6));
        const journal = join(this.options.privateDirectory, `${jobId}.json`);
        if (existsSync(journal)) continue;
        const request = updateRequestSchema.parse(JSON.parse(readRegular(join(this.options.inbox, name, 'request.json')).toString('utf8')));
        demand(request.job_id === jobId, 422, 'invalid_job', 'Update job identity differs');
        const directory = join(this.options.privateDirectory, jobId);
        let stopped = false;
        let backedUp = false;
        let previous: { version: string; image: string; database_schema?: number } | undefined;
        const status = (state: UpdateJob['state'], maintenance: boolean, message: string) => {
          const job: UpdateJob = { job_id: jobId, release_id: request.release_id, version: request.version, at: new Date().toISOString(), state, maintenance, message };
          atomicJson(journal, job);
          atomicJson(join(this.options.status, `${jobId}.json`), job, 0o644);
          atomicJson(join(this.options.status, 'current.json'), job, 0o644);
        };
        try {
          status('verifying', true, 'Verifying the signed package');
          mkdirSync(directory, { mode: 0o700 });
          for (const file of ['hub-update.json', 'hub-update.sig']) writeFileSync(join(directory, file), readRegular(join(this.options.inbox, name, file)), { flag: 'wx', mode: 0o600 });
          const metadata = verifiedPackage(directory, this.options.publicKey, { version: request.version, channel: this.options.channel, target: this.options.target });
          previous = await this.deployment.current();
          demand(semver.gt(metadata.version, previous.version), 409, 'replayed_update', 'Package is not newer than the running version');
          await copyVerified(join(this.options.inbox, name, metadata.image.filename), join(directory, metadata.image.filename), metadata.image);
          await this.deployment.load(join(directory, metadata.image.filename), metadata);
          atomicJson(join(directory, 'recovery.json'), { schema_version: '1', job_id: jobId, release_id: request.release_id, previous, next: { version: metadata.version, image: metadata.image.id }, backup_directory: join(directory, 'backup') });
          status('stopping', true, 'Stopping the application');
          stopped = true; await this.deployment.stop();
          status('backing_up', true, 'Creating a consistent offline backup');
          await this.deployment.backup(directory, previous.image); backedUp = true;
          status('starting', true, 'Starting and verifying the new version');
          await this.deployment.start(metadata.image.id);
          demand(await this.deployment.healthy(metadata.version, metadata.database_schema), 500, 'unhealthy_update', 'New version did not become healthy with the signed database schema');
          status('succeeded', false, 'Installed version verified');
        } catch {
          if (stopped && previous) {
            status('rolling_back', true, 'Recovering the previous deployment');
            try {
              await this.deployment.stop();
              if (backedUp) await this.deployment.restore(directory, previous.image);
              await this.deployment.start(previous.image);
              demand(await this.deployment.healthy(previous.version, previous.database_schema), 500, 'recovery_failed', 'Previous version is not healthy');
              status('rolled_back', false, 'Update failed; previous version and data restored');
            } catch { status('recovery_required', true, 'Update failed; operator recovery is required'); }
          } else status('failed', false, 'Package verification or preparation failed; deployment unchanged');
        }
        if (readJob(this.options.status)?.maintenance === false) rmSync(join(this.options.inbox, name), { recursive: true, force: true });
        return;
      }
    } finally { this.running = false; }
  }
}