// File: /src/backups.ts | Version: 0.1.3
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { atomicJson, readJob, readRegular, type Deployment } from './hub-update.js';
import { demand, Store } from './store.js';
import type { Principal } from './contract.js';

const secret = z.string().min(1).max(256).regex(/^[^\r\n\0]+$/);
export const backupConfigSchema = z.strictObject({
  enabled: z.boolean(), host: z.ipv4().refine((host) => {
    const parts = host.split('.').map(Number);
    return parts[0] === 10 || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31);
  }, 'A private LAN IPv4 address is required'),
  share: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9 _-]{0,63}$/), directory: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/),
  username: z.string().min(1).max(100).regex(/^[^\r\n=\0]+$/), domain: z.string().max(100).regex(/^[^\r\n=\0]*$/),
  smb3_only: z.literal(true), password: secret, recovery_password: secret.min(16), utc_time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  daily: z.number().int().min(1).max(365), weekly: z.number().int().min(0).max(52), monthly: z.number().int().min(0).max(120),
});
export type BackupConfig = z.infer<typeof backupConfigSchema>;
export type BackupPublicConfig = Omit<BackupConfig, 'password' | 'recovery_password'> & { password_set: boolean; recovery_password_set: boolean };
export const backupJobSchema = z.strictObject({ id: z.uuid(), kind: z.enum(['backup', 'test']), state: z.enum(['queued', 'running', 'succeeded', 'failed', 'recovery_required']),
  maintenance: z.boolean(), at: z.iso.datetime(), message: z.string().max(200), snapshot: z.string().regex(/^[a-f0-9]{64}$/).nullable() });
export type BackupJob = z.infer<typeof backupJobSchema>;
export type BackupOptions = { inbox: string; status: string; key: Buffer };
const requestSchema = z.strictObject({ id: z.uuid(), kind: z.enum(['backup', 'test']), at: z.iso.datetime() });
function seal(config: BackupConfig, key: Buffer) {
  demand(key.length === 32, 500, 'backup_key', 'A protected 32-byte backup configuration key is required');
  const nonce = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const bytes = Buffer.concat([cipher.update(JSON.stringify(config), 'utf8'), cipher.final()]);
  return { nonce: nonce.toString('hex'), tag: cipher.getAuthTag().toString('hex'), ciphertext: bytes.toString('base64') };
}
export function readBackupConfig(options: BackupOptions): BackupConfig | null {
  const path = join(options.inbox, 'backup-config.json'); if (!existsSync(path)) return null;
  const envelope = z.strictObject({ nonce: z.string().regex(/^[a-f0-9]{24}$/), tag: z.string().regex(/^[a-f0-9]{32}$/), ciphertext: z.string().max(20000) })
    .parse(JSON.parse(readRegular(path).toString('utf8')));
  const cipher = createDecipheriv('aes-256-gcm', options.key, Buffer.from(envelope.nonce, 'hex'));
  cipher.setAuthTag(Buffer.from(envelope.tag, 'hex'));
  return backupConfigSchema.parse(JSON.parse(Buffer.concat([cipher.update(Buffer.from(envelope.ciphertext, 'base64')), cipher.final()]).toString('utf8')));
}
export class Backups {
  constructor(readonly options: BackupOptions, private store: Store) {
    demand(options.key.length === 32, 500, 'backup_key', 'A protected 32-byte backup configuration key is required');
  }
  job(): BackupJob | null {
    const path = join(this.options.status, 'backup-current.json');
    const current = existsSync(path) ? backupJobSchema.parse(JSON.parse(readRegular(path).toString('utf8'))) : null;
    const pending = join(this.options.inbox, 'backup-request.json');
    if (existsSync(pending)) {
      const request = requestSchema.parse(JSON.parse(readRegular(pending).toString('utf8')));
      if (request.id !== current?.id) return { ...request, state: 'queued', maintenance: current?.maintenance ?? false, message: 'Waiting for backup agent', snapshot: null };
    }
    return current;
  }
  maintenance(): boolean { try { return this.job()?.maintenance === true; } catch { return true; } }
  ready(): boolean {
    try {
      const value = z.object({ at: z.iso.datetime(), key_sha256: z.string() }).parse(JSON.parse(readRegular(join(this.options.status, 'backup-agent.json')).toString('utf8')));
      const age = Date.now() - Date.parse(value.at);
      return age >= -5000 && age < 30000 && value.key_sha256 === createHash('sha256').update(this.options.key).digest('hex');
    } catch { return false; }
  }
  settings(): BackupPublicConfig | null {
    const config = readBackupConfig(this.options); if (!config) return null;
    const { password, recovery_password, ...safe } = config;
    return { ...safe, password_set: password.length > 0, recovery_password_set: recovery_password.length > 0 };
  }
  save(input: unknown, actor: Principal) {
    demand(!['running', 'queued', 'recovery_required'].includes(this.job()?.state ?? ''), 409, 'backup_busy', 'Wait for the active backup operation');
    const parsed = backupConfigSchema.extend({ password: secret.optional(), recovery_password: secret.min(16).optional() }).parse(input);
    const previous = readBackupConfig(this.options);
    if (previous && previous.host === parsed.host && previous.share === parsed.share && previous.directory === parsed.directory) {
      demand(parsed.recovery_password === undefined || parsed.recovery_password === previous.recovery_password, 409, 'repository_key_immutable', 'Changing an existing repository recovery password requires an offline key-rotation procedure');
    }
    const config = backupConfigSchema.parse({ ...parsed, password: parsed.password ?? previous?.password, recovery_password: parsed.recovery_password ?? previous?.recovery_password });
    this.store.audit(actor, 'backup.settings_requested', 'backup');
    atomicJson(join(this.options.inbox, 'backup-config.json'), seal(config, this.options.key));
    return this.settings();
  }
  enqueue(kind: 'backup' | 'test', actor: Principal): BackupJob {
    demand(this.ready(), 503, 'backup_agent_unavailable', 'Backup agent is not ready');
    demand(readBackupConfig(this.options), 409, 'backup_not_configured', 'Configure the backup destination first');
    const requestPath = join(this.options.inbox, 'backup-request.json');
    const current = this.job();
    demand(current?.state !== 'running' && current?.state !== 'recovery_required', 409, 'backup_busy', 'Another backup requires attention');
    if (existsSync(requestPath)) {
      const previous = requestSchema.parse(JSON.parse(readRegular(requestPath).toString('utf8')));
      demand(previous.id === current?.id && current.state !== 'queued', 409, 'backup_busy', 'A backup request is pending');
    }
    const request = { id: randomUUID(), kind, at: new Date().toISOString() };
    this.store.audit(actor, `backup.${kind}_requested`, request.id);
    atomicJson(requestPath, request);
    return { ...request, state: 'queued', maintenance: false, message: 'Waiting for backup agent', snapshot: null };
  }
}
export type BackupRunner = (program: 'restic' | 'rclone', args: string[], options: { directory: string; env: NodeJS.ProcessEnv; input?: string }) => Promise<string>;
export const runBackupCommand: BackupRunner = (program, args, options) => new Promise((resolve, reject) => {
  const child = execFile(`/usr/bin/${program}`, args, { cwd: options.directory, env: options.env, timeout: 7200000, maxBuffer: 8 * 1024 * 1024, killSignal: 'SIGKILL' }, (error, stdout) => {
    if (error) reject(new Error('Backup command failed')); else resolve(stdout);
  });
  child.stdin?.end(options.input ?? '');
});
export class HostBackups {
  constructor(readonly options: BackupOptions & { privateDirectory: string; configDirectory: string }, private deployment: Deployment, private run: BackupRunner = runBackupCommand) {
    const previous = this.job();
    if (previous?.state === 'running') this.publish({ ...previous, state: previous.maintenance ? 'recovery_required' : 'failed', at: new Date().toISOString(), message: 'Interrupted backup; inspect protected recovery state before retrying' });
    this.heartbeat();
  }
  private job(): BackupJob | null {
    const path = join(this.options.status, 'backup-current.json');
    return existsSync(path) ? backupJobSchema.parse(JSON.parse(readRegular(path).toString('utf8'))) : null;
  }
  heartbeat() {
    atomicJson(join(this.options.status, 'backup-agent.json'), { at: new Date().toISOString(), key_sha256: createHash('sha256').update(this.options.key).digest('hex') }, 0o644);
  }
  private publish(job: BackupJob) {
    atomicJson(join(this.options.privateDirectory, 'backup-current.json'), job);
    atomicJson(join(this.options.status, 'backup-current.json'), job, 0o644);
  }
  async once(now = new Date()) {
    this.heartbeat();
    if (readJob(this.options.status)?.maintenance || this.job()?.maintenance) return;
    if (readdirSync(this.options.inbox).some((entry) => /^[a-f0-9-]{36}\.ready$/.test(entry))) return;
    const config = readBackupConfig(this.options); if (!config) return;
    const requestPath = join(this.options.inbox, 'backup-request.json');
    let request = existsSync(requestPath) ? requestSchema.parse(JSON.parse(readRegular(requestPath).toString('utf8'))) : null;
    const previous = this.job();
    if (request?.id === previous?.id) request = null;
    if (!request) {
      const day = now.toISOString().slice(0, 10); const receipt = join(this.options.privateDirectory, 'backup-schedule.json');
      const last = existsSync(receipt) ? z.object({ day: z.string() }).parse(JSON.parse(readRegular(receipt).toString('utf8'))).day : '';
      if (!config.enabled || day === last || now.toISOString().slice(11, 16) < config.utc_time) return;
      request = { id: randomUUID(), kind: 'backup', at: now.toISOString() }; atomicJson(receipt, { day });
    }
    const directory = join(this.options.privateDirectory, `backup-${request.id}`);
    const consume = () => {
      if (existsSync(requestPath) && requestSchema.parse(JSON.parse(readRegular(requestPath).toString('utf8'))).id === request!.id) rmSync(requestPath);
    };
    if (existsSync(directory)) { consume(); return; }
    mkdirSync(directory, { mode: 0o700 });
    let job: BackupJob = { ...request, state: 'running', maintenance: false, message: 'Preparing encrypted backup', snapshot: null };
    const status = (change: Partial<BackupJob>) => { job = { ...job, ...change, at: new Date().toISOString() }; this.publish(job); };
    status({});
    const source = join(directory, 'source'); mkdirSync(source, { mode: 0o700 });
    const passwordFile = join(directory, 'repository-password'); const rcloneFile = join(directory, 'rclone.conf');
    const env: NodeJS.ProcessEnv = { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: directory, TMPDIR: directory, RCLONE_CONFIG: rcloneFile,
      RESTIC_PASSWORD_FILE: passwordFile, RESTIC_REPOSITORY: `rclone:synology:${config.share}/${config.directory}`, RESTIC_CACHE_DIR: join(directory, 'cache') };
    const run = (program: 'restic' | 'rclone', args: string[], input?: string) => this.run(program, args, { directory: source, env, ...(input === undefined ? {} : { input }) });
    let stopped = false; let current: Awaited<ReturnType<Deployment['current']>> | undefined;
    try {
      const obscured = (await run('rclone', ['obscure', '-'], config.password)).trim();
      demand(/^[a-zA-Z0-9_-]+$/.test(obscured), 500, 'invalid_obscured_secret', 'Invalid SMB configuration');
      writeFileSync(rcloneFile, `[synology]\ntype = smb\nhost = ${config.host}\nport = 445\nuser = ${config.username}\ndomain = ${config.domain || 'WORKGROUP'}\npass = ${obscured}\n`, { flag: 'wx', mode: 0o600 });
      writeFileSync(passwordFile, config.recovery_password, { flag: 'wx', mode: 0o600 });
      await run('rclone', ['lsf', `synology:${config.share}`, '--max-depth', '1', '--dirs-only']);
      if (request.kind === 'test') { status({ state: 'succeeded', message: 'SMB share connection verified' }); return; }
      try { await run('restic', ['snapshots', '--json']); }
      catch { await run('restic', ['init', '--repository-version', '2']); await run('restic', ['snapshots', '--json']); }
      current = await this.deployment.current();
      atomicJson(join(directory, 'recovery.json'), { current, backup_directory: join(source, 'backup') });
      status({ maintenance: true, message: 'Creating a consistent local recovery copy' });
      stopped = true; await this.deployment.stop();
      await this.deployment.backup(source, current.image);
      cpSync(this.options.configDirectory, join(source, 'host'), { recursive: true, filter: (path) => {
        const stat = lstatSync(path); demand(!stat.isSymbolicLink() && (stat.isFile() || stat.isDirectory()), 500, 'invalid_host_config', 'Unexpected host configuration file'); return true;
      } });
      cpSync(join(this.options.inbox, 'backup-config.json'), join(source, 'host', 'backup-config.encrypted.json'));
      atomicJson(join(source, 'deployment.json'), { schema_version: '1', current, created_at: now.toISOString() });
      await this.deployment.start(current.image);
      demand(await this.deployment.healthy(current.version), 500, 'backup_restart_failed', 'Hub did not restart'); stopped = false;
      status({ maintenance: false, message: 'Transferring encrypted snapshot to Synology' });
      const result = await run('restic', ['backup', '--json', '--host', 'device-update-hub', '--tag', 'device-update-hub', '.']);
      const summary = result.split('\n').filter(Boolean).map((line) => JSON.parse(line) as { message_type?: string; snapshot_id?: string }).find((line) => line.message_type === 'summary');
      const created = z.string().regex(/^(?:[a-f0-9]{8}|[a-f0-9]{64})$/).parse(summary?.snapshot_id);
      const snapshots = z.array(z.object({ id: z.string().regex(/^[a-f0-9]{64}$/) })).length(1)
        .parse(JSON.parse(await run('restic', ['snapshots', '--json', created])));
      const snapshot = snapshots[0]!.id;
      demand(snapshot.startsWith(created), 500, 'invalid_snapshot', 'Repository returned a different snapshot');
      await run('restic', ['check']);
      await run('restic', ['forget', '--prune', '--host', 'device-update-hub', '--tag', 'device-update-hub', '--group-by', 'host,tags', '--keep-daily', String(config.daily), '--keep-weekly', String(config.weekly), '--keep-monthly', String(config.monthly)]);
      status({ state: 'succeeded', snapshot, message: 'Encrypted backup and repository check completed' });
      rmSync(source, { recursive: true, force: true });
    } catch {
      let recovered = !stopped;
      if (stopped && current) {
        try { await this.deployment.start(current.image); recovered = await this.deployment.healthy(current.version); } catch {}
      }
      status({ state: recovered ? 'failed' : 'recovery_required', maintenance: !recovered, message: recovered ? 'Backup failed; local recovery copy retained when available' : 'Hub restart failed; operator recovery required' });
    } finally {
      rmSync(passwordFile, { force: true }); rmSync(rcloneFile, { force: true }); rmSync(join(directory, 'cache'), { recursive: true, force: true });
      consume();
      this.heartbeat();
    }
  }
}