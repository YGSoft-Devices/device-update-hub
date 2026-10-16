// File: /scripts/host-updater.ts | Version: 0.2.0
import { lstatSync, realpathSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { HostUpdater, readRegular } from '../src/hub-update.js';
import { DockerDeployment, hostPolicySchema } from '../src/docker-deployment.js';
import { HostBackups, backupJobSchema } from '../src/backups.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

function protectedDirectory(path: string): void {
  for (let current = resolve(path);;) {
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== 0 || (stat.mode & 0o022) !== 0) throw new Error('Trusted directory ancestry must be root-owned and protected');
    const parent = dirname(current);
    if (parent === current) return;
    current = parent;
  }
}
function protectedFile(path: string): Buffer {
  protectedDirectory(dirname(path));
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== 0 || (stat.mode & 0o022) !== 0) throw new Error('Host configuration must be a root-owned regular file, not writable by group/others');
  return readRegular(path);
}
async function main() {
  if (process.platform !== 'linux' || process.getuid?.() !== 0) throw new Error('Run the host updater through the installed Linux systemd service');
  const argument = process.argv[2];
  if (!argument || process.argv.length !== 3) throw new Error('Usage: node build/scripts/host-updater.js /etc/device-update-hub/updater.json');
  const policy = hostPolicySchema.parse(JSON.parse(protectedFile(resolve(argument)).toString('utf8')));
  for (const path of [policy.private_directory, dirname(policy.compose_file), dirname(policy.public_key_file)]) {
    protectedDirectory(path);
  }
  protectedDirectory(dirname(policy.inbox)); protectedDirectory(dirname(policy.status));
  protectedFile(policy.compose_file);
  const paths = [policy.private_directory, policy.inbox, policy.status].map((path) => realpathSync(path));
  for (const [index, path] of paths.entries()) {
    for (const other of paths.slice(index + 1)) {
      if (path === other || path.startsWith(`${other}${sep}`) || other.startsWith(`${path}${sep}`)) throw new Error('Inbox, status and private agent storage must be disjoint');
    }
  }
  const status = lstatSync(policy.status);
  if (!status.isDirectory() || status.uid !== 0 || (status.mode & 0o022) !== 0 || (status.mode & 0o005) !== 0o005) throw new Error('Agent status must be root-owned, readable/traversable and not writable by the web process');
  const inbox = lstatSync(policy.inbox);
  if (!inbox.isDirectory() || inbox.uid !== 1000 || (inbox.mode & 0o077) !== 0) throw new Error('Inbox must be a private directory owned by application UID 1000');
  if ((lstatSync(policy.private_directory).mode & 0o077) !== 0) throw new Error('Private agent storage must not be accessible by other accounts');
  const architecture = process.arch === 'x64' ? 'amd64' : process.arch;
  if (policy.target.architecture !== architecture) throw new Error('Configured target differs from host architecture');
  const deployment = new DockerDeployment(policy);
  const updater = new HostUpdater({ inbox: policy.inbox, status: policy.status, publicKey: protectedFile(policy.public_key_file).toString('utf8'),
    privateDirectory: policy.private_directory, target: policy.target, channel: policy.channel, currentVersion: policy.current_version }, deployment);
  if (policy.backup_config_directory) protectedDirectory(policy.backup_config_directory);
  const backups = policy.backup_key_file && policy.backup_config_directory ? new HostBackups({ inbox: policy.inbox, status: policy.status,
    key: protectedFile(policy.backup_key_file), privateDirectory: policy.private_directory, configDirectory: policy.backup_config_directory }, deployment) : null;
  let stopping = false;
  let running = false;
  const tick = async () => {
    if (!stopping) { updater.heartbeat(); backups?.heartbeat(); }
    if (stopping || running) return;
    running = true;
    try {
      const backupStatus = join(policy.status, 'backup-current.json');
      const maintenance = existsSync(backupStatus) && backupJobSchema.parse(JSON.parse(readRegular(backupStatus).toString('utf8'))).maintenance;
      if (!maintenance) await updater.once();
      await backups?.once();
    } catch { console.error('Host operation rejected; inspect protected state and exchange permissions'); }
    finally { running = false; if (stopping) process.exit(0); }
  };
  const timer = setInterval(() => { void tick(); }, 2000);
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => { stopping = true; clearInterval(timer); if (!running) process.exit(0); });
  await tick();
}
main().catch(() => { console.error('Host updater startup refused; check trusted Linux configuration and permissions'); process.exitCode = 1; });