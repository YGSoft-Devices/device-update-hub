// File: /tests/hub-update.test.ts | Version: 0.3.0
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { HostUpdater, atomicJson, packageSchema, readJob, verifiedPackage, type Deployment, type HubUpdateOptions } from '../src/hub-update.js';
import { buildApp, type Credentials } from '../src/app.js';
import { hostPolicySchema } from '../src/docker-deployment.js';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'duh-updater-'));
  const keys = generateKeyPairSync('ed25519');
  const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const target = { device_type: 'hub-server', os: 'linux', architecture: 'amd64', hardware_revision: 'docker', updater_protocol: 1 as const };
  const options: HubUpdateOptions & { privateDirectory: string } = { inbox: join(root, 'inbox'), status: join(root, 'status'), privateDirectory: join(root, 'private'), publicKey, target, currentVersion: '0.1.0', channel: 'stable' };
  mkdirSync(options.inbox);
  const jobId = randomUUID();
  const job = join(options.inbox, `${jobId}.ready`); mkdirSync(job);
  const image = Buffer.from('isolated Docker image fixture, never loaded');
  const metadata = packageSchema.parse({ schema_version: '1', product: 'device-update-hub', version: '0.2.0', channel: 'stable', target, database_schema: 2,
    image: { filename: 'hub-image.tar', size: image.length, sha256: createHash('sha256').update(image).digest('hex'), id: `sha256:${'a'.repeat(64)}` } });
  const bytes = Buffer.from(JSON.stringify(metadata));
  writeFileSync(join(job, 'hub-update.json'), bytes); writeFileSync(join(job, 'hub-update.sig'), sign(null, bytes, keys.privateKey)); writeFileSync(join(job, 'hub-image.tar'), image);
  writeFileSync(join(job, 'request.json'), JSON.stringify({ schema_version: '1', job_id: jobId, release_id: randomUUID(), version: metadata.version, requested_by: 'sandbox-admin' }));
  const actions: string[] = [];
  const deployment: Deployment = {
    async current() { actions.push('current'); return { version: '0.1.0', image: 'old-image' }; },
    async load(path) { actions.push('load'); assert.deepEqual(readFileSync(path), image); },
    async stop() { actions.push('stop'); }, async backup() { actions.push('backup'); },
    async start(imageId) { actions.push(`start:${imageId}`); }, async healthy(value) { actions.push(`health:${value}`); return true; },
    async restore() { actions.push('restore'); },
  };
  return { root, keys, job, jobId, options, metadata, image, actions, deployment, cleanup() { rmSync(root, { recursive: true, force: true }); } };
}
test('signed packages reject a different key, target, schema or tampered metadata', () => {
  const hub = fixture();
  try {
    assert.equal(verifiedPackage(hub.job, hub.options.publicKey, { version: '0.2.0', channel: 'stable', target: hub.options.target }).version, '0.2.0');
    assert.throws(() => verifiedPackage(hub.job, hub.options.publicKey, { version: '0.2.0', channel: 'stable', target: { ...hub.options.target, architecture: 'arm64' } }));
    const other = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }).toString();
    assert.throws(() => verifiedPackage(hub.job, other, { version: '0.2.0', channel: 'stable', target: hub.options.target }));
    assert.equal(packageSchema.safeParse({ ...hub.metadata, command: 'untrusted' }).success, false);
    assert.equal(packageSchema.safeParse({ ...hub.metadata, database_schema: 3 }).success, true);
    assert.equal(packageSchema.safeParse({ ...hub.metadata, database_schema: 4 }).success, false);
    writeFileSync(join(hub.job, 'hub-update.json'), JSON.stringify({ ...hub.metadata, version: '0.3.0' }));
    assert.throws(() => verifiedPackage(hub.job, hub.options.publicKey, { version: '0.3.0', channel: 'stable', target: hub.options.target }));
  } finally { hub.cleanup(); }
});
test('host updater verifies before stopping, backs up, verifies the new version and never replays a completed job', async () => {
  const hub = fixture();
  try {
    hub.deployment.stop = async () => {
      const recovery = JSON.parse(readFileSync(join(hub.options.privateDirectory, hub.jobId, 'recovery.json'), 'utf8'));
      assert.deepEqual(recovery.previous, { version: '0.1.0', image: 'old-image' });
      assert.deepEqual(recovery.next, { version: '0.2.0', image: hub.metadata.image.id });
      assert.equal(recovery.job_id, hub.jobId);
      assert.equal(recovery.backup_directory, join(hub.options.privateDirectory, hub.jobId, 'backup'));
      hub.actions.push('stop');
    };
    const updater = new HostUpdater(hub.options, hub.deployment);
    await updater.once();
    assert.equal(readJob(hub.options.status)?.state, 'succeeded');
    assert.deepEqual(hub.actions, ['current', 'load', 'stop', 'backup', `start:${hub.metadata.image.id}`, 'health:0.2.0']);
    await updater.once(); assert.equal(hub.actions.length, 6);
    assert.equal(existsSync(join(hub.options.privateDirectory, hub.jobId, 'hub-image.tar')), true);
  } finally { hub.cleanup(); }
});
test('corrupt image never stops the server; failed health restores the backup and the previous image', async () => {
  const hub = fixture();
  try {
    writeFileSync(join(hub.job, 'hub-image.tar'), Buffer.alloc(hub.image.length, 120));
    await new HostUpdater(hub.options, hub.deployment).once();
    assert.equal(readJob(hub.options.status)?.state, 'failed'); assert.equal(hub.actions.includes('stop'), false);
    assert.equal(readdirSync(join(hub.options.privateDirectory, hub.jobId)).includes('hub-image.tar'), false);
  } finally { hub.cleanup(); }
  const failed = fixture();
  try {
    failed.deployment.healthy = async (value) => value === '0.1.0';
    await new HostUpdater(failed.options, failed.deployment).once();
    assert.equal(readJob(failed.options.status)?.state, 'rolled_back');
    assert.equal(failed.actions.includes('restore'), true);
    assert.equal(failed.actions.at(-1), 'start:old-image');
  } finally { failed.cleanup(); }
});

test('admin discovery has no side effects; confirmation queues once, enforces maintenance and the host completes independently', async () => {
  const hub = fixture();
  const files = ['hub-update.json', 'hub-update.sig', 'hub-image.tar'].map((filename) => ({ filename, bytes: readFileSync(join(hub.job, filename)) }));
  rmSync(hub.job, { recursive: true });
  const credentials: Credentials = (['admin', 'publisher', 'reader'] as const).map((role) => ({ id: role, role, products: ['device-update-hub'], token: randomBytes(32).toString('hex') }));
  const headers = (role = 'admin') => ({ authorization: `Bearer ${credentials.find((entry) => entry.role === role)!.token}` });
  const { app, store } = await buildApp({ directory: join(hub.root, 'catalog'), credentials, hubUpdate: hub.options });
  try {
    const admin = { id: 'admin', role: 'admin' as const, products: [] };
    store.createProduct({ id: 'device-update-hub', name: 'Device Update Hub' }, admin);
    let release = store.create({ product: 'device-update-hub', version: '0.2.0', channel: 'stable', release_notes: 'Sandbox update', targets: [hub.options.target] }, 'sandbox-hub-update', admin);
    for (const file of files) {
      const artifact = { id: randomUUID(), filename: file.filename, size: file.bytes.length, sha256: createHash('sha256').update(file.bytes).digest('hex') };
      writeFileSync(store.artifactPath(artifact), file.bytes);
      release = store.attach(release.id, artifact, admin);
    }
    store.setManifest(release.id, { schema_version: '1', artifact_order: release.artifacts.map((artifact) => artifact.id) }, admin);
    store.publish(release.id, admin);
    const events = store.events().length;
    for (const role of ['publisher', 'reader']) {
      assert.equal((await app.inject({ url: '/api/v1/admin/hub-update', headers: headers(role) })).statusCode, 403);
      assert.equal((await app.inject({ method: 'POST', url: '/api/v1/admin/hub-update/check', headers: headers(role) })).statusCode, 403);
    }
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/admin/hub-update/check', headers: headers() })).json().release.id, release.id);
    assert.equal(store.events().length, events); assert.deepEqual(readdirSync(hub.options.inbox), []);
    const install = (confirmation: string) => app.inject({ method: 'POST', url: '/api/v1/admin/hub-update/install', headers: headers(), payload: { release_id: release.id, confirmation } });
    assert.equal((await install('0.2.0')).statusCode, 503);
    const updater = new HostUpdater(hub.options, hub.deployment);
    assert.equal((await install('wrong')).statusCode, 409);
    const queued = await install('0.2.0'); assert.equal(queued.statusCode, 202, queued.body);
    assert.equal((await install('0.2.0')).json().job_id, queued.json().job_id);
    assert.equal((await app.inject({ method: 'PUT', url: '/api/v1/admin/settings', headers: headers(), payload: { upload_max_bytes: null, upload_timeout_seconds: 3600 } })).statusCode, 503);
    await updater.once();
    assert.equal((await app.inject({ url: '/api/v1/admin/hub-update', headers: headers() })).json().job.state, 'succeeded');
    assert.deepEqual(readdirSync(hub.options.inbox), []);
  } finally { await app.close(); hub.cleanup(); }
});

test('interrupted or failed rollback remains in maintenance and cannot silently replay', async () => {
  const hub = fixture();
  try {
    hub.deployment.healthy = async () => false;
    const updater = new HostUpdater(hub.options, hub.deployment);
    await updater.once(); assert.equal(readJob(hub.options.status)?.state, 'recovery_required');
    const count = hub.actions.length;
    await updater.once(); assert.equal(hub.actions.length, count); assert.equal(readJob(hub.options.status)?.maintenance, true);
    const job = readJob(hub.options.status)!;
    atomicJson(join(hub.options.status, 'current.json'), { ...job, state: 'starting' });
    await new HostUpdater(hub.options, hub.deployment).once();
    assert.equal(readJob(hub.options.status)?.state, 'recovery_required');
  } finally { hub.cleanup(); }
});

test('packaging CLI signs the exact image bytes without emitting its signing key', async () => {
  const hub = fixture();
  try {
    const keyPath = join(hub.root, 'signing.pem');
    const privateKey = hub.keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    writeFileSync(keyPath, privateKey, { mode: 0o600 });
    const spec = join(hub.root, 'spec.json');
    const { image, ...metadata } = hub.metadata;
    writeFileSync(spec, JSON.stringify({ ...metadata, image_path: join(hub.job, image.filename), image_id: image.id }));
    const output = join(hub.root, 'package');
    const result = await promisify(execFile)(process.execPath, ['--import', 'tsx', 'scripts/package-hub.ts', spec, output], { env: { ...process.env, DUH_SIGNING_KEY_FILE: keyPath } });
    assert.equal(verifiedPackage(output, hub.options.publicKey, { version: hub.metadata.version, channel: 'stable', target: hub.options.target }).image.sha256, image.sha256);
    assert.equal(result.stdout.includes(privateKey), false);
    assert.equal(JSON.parse(readFileSync(join(output, 'release-plan.json'), 'utf8')).files.length, 3);
  } finally { hub.cleanup(); }
});

test('host example policy rejects remote health URLs, unsafe mount paths and extra commands', () => {
  const policy = JSON.parse(readFileSync('examples/host-updater.json', 'utf8'));
  assert.equal(hostPolicySchema.parse(policy).target.os, 'linux');
  for (const change of [{ health_url: 'https://example.org/health' }, { private_directory: '/tmp/data,readonly' }, { command: 'untrusted' }]) {
    assert.equal(hostPolicySchema.safeParse({ ...policy, ...change }).success, false);
  }
});

test('POSIX shared status remains readable under a private umask and symlink package metadata is refused', { skip: process.platform === 'win32' }, () => {
  const hub = fixture();
  const previousMask = process.umask(0o077);
  try {
    new HostUpdater(hub.options, hub.deployment);
    assert.equal(statSync(join(hub.options.status, 'agent.json')).mode & 0o777, 0o644);
    rmSync(join(hub.job, 'hub-update.json'));
    symlinkSync(join(hub.job, 'request.json'), join(hub.job, 'hub-update.json'));
    assert.throws(() => verifiedPackage(hub.job, hub.options.publicKey, { version: '0.2.0', channel: 'stable', target: hub.options.target }));
  } finally { process.umask(previousMask); hub.cleanup(); }
});