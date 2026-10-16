// File: /tests/api.test.ts | Version: 0.1.4
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { get } from 'node:http';
import { buildApp, type Credentials } from '../src/app.js';
import type { Release } from '../src/contract.js';

const target = { device_type: 'rpi-camera', os: 'linux', architecture: 'arm64', hardware_revision: 'rev-b', updater_protocol: 1 };
const draft = { product: 'meeting-agent', version: '1.2.0', channel: 'stable', targets: [target], release_notes: 'Test release' };
function multipartBody(filename: string, data: Buffer = Buffer.from('trusted payload')) {
  const boundary = 'duh-test-boundary';
  return { headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`), data, Buffer.from(`\r\n--${boundary}--\r\n`)]) };
}
async function fixture(uploadLimit?: number) {
  const directory = mkdtempSync(join(tmpdir(), 'duh-test-'));
  const credentials: Credentials = (['admin', 'publisher', 'reader'] as const).map((role) => ({
    id: `test-${role}`, role, products: role === 'admin' ? [] : ['meeting-agent'], token: randomBytes(32).toString('hex'),
  }));
  const headers = (role: 'admin' | 'publisher' | 'reader' = 'admin') => ({ authorization: `Bearer ${credentials.find((entry) => entry.role === role)!.token}` });
  let hub = await buildApp({ directory, credentials, uploadLimit, uploadTimeoutMs: 500 });
  await hub.app.inject({ method: 'POST', url: '/api/v1/admin/products', headers: headers(), payload: { id: 'meeting-agent', name: 'Meeting Agent' } });
  return {
    get app() { return hub.app; }, get store() { return hub.store; }, directory, credentials, headers,
    async restart() { await hub.app.close(); hub = await buildApp({ directory, credentials, uploadLimit, uploadTimeoutMs: 500 }); },
    async cleanup() { await hub.app.close(); rmSync(directory, { recursive: true, force: true }); },
    async create(version = '1.2.0') {
      const result = await hub.app.inject({ method: 'POST', url: '/api/v1/publishing/releases', headers: { ...headers('publisher'), 'idempotency-key': `release-${version.replaceAll('.', '-')}` }, payload: { ...draft, version } });
      assert.equal(result.statusCode, 201, result.body);
      return result.json<Release>();
    },
    async upload(id: string, filename = 'firmware.bin', data?: Buffer) {
      const body = multipartBody(filename, data);
      return hub.app.inject({ method: 'POST', url: `/api/v1/publishing/releases/${id}/artifacts`, headers: { ...headers('publisher'), ...body.headers }, payload: body.payload });
    },
    async complete(id: string) {
      const upload = await this.upload(id);
      assert.equal(upload.statusCode, 200, upload.body);
      const release = upload.json<Release>();
      await hub.app.inject({ method: 'PUT', url: `/api/v1/publishing/releases/${id}/manifest`, headers: headers('publisher'), payload: { schema_version: '1', artifact_order: release.artifacts.map((artifact) => artifact.id) } });
      const publish = await hub.app.inject({ method: 'POST', url: `/api/v1/publishing/releases/${id}/publish`, headers: headers('publisher') });
      assert.equal(publish.statusCode, 200, publish.body);
      return publish.json<Release>();
    },
  };
}

test('private multi-file publishing, discovery, immutable manifest, ranges, withdrawal and restart', async () => {
  const hub = await fixture();
  try {
    const release = await hub.create();
    assert.equal((await hub.app.inject({ method: 'POST', url: `/api/v1/publishing/releases/${release.id}/publish`, headers: hub.headers('publisher') })).statusCode, 422);
    const first = await hub.upload(release.id);
    assert.equal(first.statusCode, 200, first.body);
    const second = await hub.upload(release.id, 'config.json', Buffer.from('{"enabled":true}'));
    assert.equal(second.statusCode, 200, second.body);
    const artifacts = second.json<Release>().artifacts;
    assert.equal(artifacts.length, 2);
    assert.equal((await hub.upload(release.id)).json<Release>().artifacts.length, 2);
    assert.equal((await hub.upload(release.id, 'firmware.bin', Buffer.from('different'))).statusCode, 409);
    const manifestUrl = `/api/v1/releases/${release.id}/manifest`;
    assert.equal((await hub.app.inject({ url: manifestUrl, headers: hub.headers('reader') })).statusCode, 404);
    assert.equal((await hub.app.inject({ method: 'PUT', url: `/api/v1/publishing/releases/${release.id}/manifest`, headers: hub.headers(), payload: { schema_version: '1', artifact_order: [artifacts[0]!.id] } })).statusCode, 422);
    await hub.app.inject({ method: 'PUT', url: `/api/v1/publishing/releases/${release.id}/manifest`, headers: hub.headers(), payload: { schema_version: '1', artifact_order: artifacts.map((artifact) => artifact.id) } });
    assert.equal((await hub.app.inject({ method: 'POST', url: `/api/v1/publishing/releases/${release.id}/validate`, headers: hub.headers() })).json().valid, true);
    const publish = () => hub.app.inject({ method: 'POST', url: `/api/v1/publishing/releases/${release.id}/publish`, headers: hub.headers('publisher') });
    assert.equal((await publish()).statusCode, 200);
    assert.equal((await publish()).statusCode, 200);
    const manifest = await hub.app.inject({ url: manifestUrl, headers: hub.headers('reader') });
    assert.equal(manifest.json().artifacts.length, 2);
    const eventsBefore = hub.store.events().length;
    const checkPayload = { product: draft.product, channel: 'stable', target, current_version: '1.0.0' };
    const check = () => hub.app.inject({ method: 'POST', url: '/api/v1/updates/check', headers: hub.headers('reader'), payload: checkPayload });
    assert.equal((await check()).json().release.version, '1.2.0');
    assert.equal(hub.store.events().length, eventsBefore, 'check must have no mutation side effects');
    for (const payload of [{ ...checkPayload, current_version: '1.2.0' }, { ...checkPayload, channel: 'beta' }, { ...checkPayload, target: { ...target, hardware_revision: 'other' } }]) {
      assert.equal((await hub.app.inject({ method: 'POST', url: '/api/v1/updates/check', headers: hub.headers('reader'), payload })).json().update_available, false);
    }
    const downloadUrl = `/api/v1/artifacts/${artifacts[0]!.id}/download`;
    const download = await hub.app.inject({ url: downloadUrl, headers: hub.headers('reader') });
    assert.equal(createHash('sha256').update(download.rawPayload).digest('hex'), artifacts[0]!.sha256);
    const partial = await hub.app.inject({ url: downloadUrl, headers: { ...hub.headers('reader'), range: 'bytes=2-5' } });
    assert.equal(partial.statusCode, 206);
    assert.deepEqual(partial.rawPayload, download.rawPayload.subarray(2, 6));
    assert.equal((await hub.app.inject({ url: downloadUrl, headers: { ...hub.headers('reader'), range: 'bytes=900-999' } })).statusCode, 416);
    assert.equal((await hub.app.inject({ url: downloadUrl, headers: { ...hub.headers('reader'), range: 'bytes=-0' } })).statusCode, 416);
    const head = await hub.app.inject({ method: 'HEAD', url: downloadUrl, headers: hub.headers('reader') });
    assert.equal(head.headers['content-length'], String(artifacts[0]!.size));
    assert.equal(head.rawPayload.length, 0);
    assert.equal((await hub.upload(release.id, 'new.bin')).statusCode, 409);
    assert.equal((await hub.app.inject({ method: 'PATCH', url: `/api/v1/publishing/releases/${release.id}`, headers: hub.headers(), payload: draft })).statusCode, 409);
    assert.equal((await hub.app.inject({ method: 'PUT', url: `/api/v1/publishing/releases/${release.id}/manifest`, headers: hub.headers(), payload: { schema_version: '1', artifact_order: artifacts.map((artifact) => artifact.id) } })).statusCode, 409);
    await hub.restart();
    assert.equal((await check()).json().update_available, true);
    assert.equal((await hub.app.inject({ url: manifestUrl, headers: hub.headers('reader') })).body, manifest.body);
    assert.deepEqual((await hub.app.inject({ url: downloadUrl, headers: hub.headers('reader') })).rawPayload, download.rawPayload);
    await hub.app.inject({ method: 'POST', url: `/api/v1/admin/releases/${release.id}/withdraw`, headers: hub.headers() });
    assert.equal((await check()).json().update_available, false);
    assert.equal((await hub.app.inject({ url: manifestUrl, headers: hub.headers('reader') })).statusCode, 404);
    assert.equal((await hub.app.inject({ url: downloadUrl, headers: hub.headers('reader') })).statusCode, 404);
    assert.equal((await publish()).statusCode, 409);
  } finally { await hub.cleanup(); }
});

test('least privilege, malformed inputs, idempotency conflicts and version reservation', async () => {
  const hub = await fixture();
  try {
    assert.equal((await hub.app.inject({ url: '/api/v1/publishing/releases' })).statusCode, 401);
    assert.equal((await hub.app.inject({ url: '/api/v1/publishing/releases', headers: hub.headers('reader') })).statusCode, 403);
    assert.equal((await hub.app.inject({ method: 'POST', url: '/api/v1/admin/products', headers: hub.headers('publisher'), payload: { id: 'other', name: 'Other' } })).statusCode, 403);
    const release = await hub.create();
    assert.equal((await hub.create()).id, release.id);
    const request = { method: 'POST' as const, url: '/api/v1/publishing/releases', headers: { ...hub.headers('publisher'), 'idempotency-key': 'release-1-2-0' } };
    assert.equal((await hub.app.inject({ ...request, payload: { ...draft, release_notes: 'changed' } })).statusCode, 409);
    assert.equal((await hub.app.inject({ ...request, headers: { ...request.headers, 'idempotency-key': 'different-key' }, payload: draft })).statusCode, 409);
    assert.equal((await hub.app.inject({ ...request, payload: { ...draft, product: 'other' } })).statusCode, 403);
    assert.equal((await hub.app.inject({ method: 'POST', url: '/api/v1/updates/check', headers: hub.headers('reader'), payload: { product: 'other', channel: 'stable', target, current_version: '1.0.0' } })).statusCode, 403);
    assert.equal((await hub.app.inject({ ...request, payload: { ...draft, command: 'sh' } })).statusCode, 400);
    assert.equal((await hub.app.inject({ method: 'POST', url: '/api/v1/updates/check', headers: { authorization: `Bearer ${randomBytes(32).toString('hex')}` }, payload: {} })).statusCode, 401);
    assert.equal((await hub.app.inject({ method: 'POST', url: `/api/v1/publishing/releases/${release.id}/publish`, headers: hub.headers('reader') })).statusCode, 403);
    assert.equal((await hub.app.inject({ url: '/api/v1/publishing/releases/not-a-uuid', headers: hub.headers() })).statusCode, 400);
    const complete = await hub.complete(release.id);
    assert.equal((await hub.create()).id, complete.id);
    assert.equal((await hub.app.inject({ method: 'POST', url: `/api/v1/admin/releases/${release.id}/withdraw`, headers: hub.headers('publisher') })).statusCode, 403);
  } finally { await hub.cleanup(); }
});

test('oversized, empty and unsafe uploads leave no visible partial artifact', { timeout: 5000 }, async () => {
  const hub = await fixture(32);
  try {
    const release = await hub.create();
    assert.equal((await hub.upload(release.id, 'large.bin', Buffer.alloc(33))).statusCode, 413);
    assert.equal((await hub.upload(release.id, 'empty.bin', Buffer.alloc(0))).statusCode, 400);
    assert.equal((await hub.upload(release.id, 'CON.bin')).statusCode, 400);
    assert.equal(hub.store.get(release.id, { id: 'test', role: 'admin', products: [] }).artifacts.length, 0);
    assert.deepEqual(readdirSync(join(hub.directory, 'staging')), []);
    const missing = multipartBody('payload.bin');
    const truncated = await hub.app.inject({ method: 'POST', url: `/api/v1/publishing/releases/${release.id}/artifacts`, headers: { ...hub.headers(), ...missing.headers }, payload: missing.payload.subarray(0, missing.payload.length - 15) });
    assert.ok(truncated.statusCode >= 400);
    assert.equal(hub.store.get(release.id, { id: 'test', role: 'admin', products: [] }).artifacts.length, 0);
  } finally { await hub.cleanup(); }
});

test('checksum failure prevents publication and rolls back audit/lifecycle changes', async () => {
  const hub = await fixture();
  try {
    const release = await hub.create();
    const uploaded = (await hub.upload(release.id)).json<Release>();
    const artifact = uploaded.artifacts[0]!;
    await hub.app.inject({ method: 'PUT', url: `/api/v1/publishing/releases/${release.id}/manifest`, headers: hub.headers(), payload: { schema_version: '1', artifact_order: [artifact.id] } });
    writeFileSync(join(hub.directory, 'blobs', artifact.sha256), 'tampered content');
    const before = hub.store.events().length;
    assert.equal((await hub.app.inject({ method: 'POST', url: `/api/v1/publishing/releases/${release.id}/publish`, headers: hub.headers() })).statusCode, 422);
    assert.equal(hub.store.events().length, before);
    assert.equal(hub.store.get(release.id, { id: 'test', role: 'admin', products: [] }).status, 'draft');
    assert.equal((await hub.app.inject({ method: 'POST', url: `/api/v1/publishing/releases/${release.id}/validate`, headers: hub.headers() })).json().valid, false);
  } finally { await hub.cleanup(); }
});

test('script publishing uses least privilege, supports safe retries and rejects changed bytes', async () => {
  const hub = await fixture();
  try {
    const address = await hub.app.listen({ host: '127.0.0.1', port: 0 });
    const credentialPath = join(hub.directory, 'credentials.json');
    writeFileSync(credentialPath, JSON.stringify(hub.credentials.filter((entry) => entry.role === 'publisher')), { mode: 0o600 });
    const planPath = join(hub.directory, 'plan.json');
    writeFileSync(join(hub.directory, 'payload.bin'), 'scripted fixture');
    writeFileSync(join(hub.directory, 'settings.json'), '{"fixture":true}');
    writeFileSync(planPath, JSON.stringify({ ...draft, files: ['payload.bin', 'settings.json'] }));
    const publish = () => promisify(execFile)(process.execPath, ['--import', 'tsx', 'scripts/publish.ts', planPath], {
      env: { ...process.env, DUH_BASE_URL: address, DUH_CREDENTIALS_FILE: credentialPath },
    });
    assert.match((await publish()).stdout, /Published meeting-agent 1.2.0/);
    assert.match((await publish()).stdout, /Published meeting-agent 1.2.0/);
    const release = hub.store.list({ id: 'test', role: 'admin', products: [] })[0]!;
    assert.equal(release.artifacts.length, 2);
    assert.equal(release.status, 'published');
    writeFileSync(join(hub.directory, 'payload.bin'), 'changed bytes');
    await assert.rejects(publish(), /Stored inventory differs/);
    assert.equal(hub.store.list({ id: 'test', role: 'admin', products: [] }).length, 1);
  } finally { await hub.cleanup(); }
});

test('publication rolls back metadata when the audit insertion fails inside its transaction', async () => {
  const hub = await fixture();
  try {
    const release = await hub.create();
    const uploaded = (await hub.upload(release.id)).json<Release>();
    await hub.app.inject({ method: 'PUT', url: `/api/v1/publishing/releases/${release.id}/manifest`, headers: hub.headers(), payload: { schema_version: '1', artifact_order: uploaded.artifacts.map((artifact) => artifact.id) } });
    const before = hub.store.events().length;
    hub.store.db.exec("CREATE TRIGGER fail_publish BEFORE INSERT ON audit WHEN NEW.action='release.published' BEGIN SELECT RAISE(ABORT,'test fault'); END");
    assert.equal((await hub.app.inject({ method: 'POST', url: `/api/v1/publishing/releases/${release.id}/publish`, headers: hub.headers() })).statusCode, 500);
    assert.equal(hub.store.get(release.id, { id: 'test', role: 'admin', products: [] }).status, 'draft');
    assert.equal(hub.store.events().length, before);
    hub.store.db.exec('DROP TRIGGER fail_publish');
    assert.equal((await hub.app.inject({ method: 'POST', url: `/api/v1/publishing/releases/${release.id}/publish`, headers: hub.headers() })).statusCode, 200);
  } finally { await hub.cleanup(); }
});

test('interrupted HTTP download resumes with unchanged bytes and matching SHA-256', async () => {
  const hub = await fixture();
  try {
    const release = await hub.create();
    const bytes = randomBytes(512 * 1024);
    const uploaded = (await hub.upload(release.id, 'application.bin', bytes)).json<Release>();
    const artifact = uploaded.artifacts[0]!;
    await hub.app.inject({ method: 'PUT', url: `/api/v1/publishing/releases/${release.id}/manifest`, headers: hub.headers(), payload: { schema_version: '1', artifact_order: [artifact.id] } });
    await hub.app.inject({ method: 'POST', url: `/api/v1/publishing/releases/${release.id}/publish`, headers: hub.headers() });
    const address = await hub.app.listen({ host: '127.0.0.1', port: 0 });
    const path = `/api/v1/artifacts/${artifact.id}/download`;
    const first = await new Promise<Buffer>((resolve, reject) => {
      const connection = get(`${address}${path}`, { headers: hub.headers('reader') }, (response) => {
        response.once('data', (chunk: Buffer) => { connection.destroy(); resolve(Buffer.from(chunk)); });
        response.once('error', (error) => { if ((error as NodeJS.ErrnoException).code !== 'ECONNRESET') reject(error); });
      });
      connection.once('error', reject);
    });
    assert.ok(first.length > 0 && first.length < bytes.length);
    const rest = await fetch(`${address}${path}`, { headers: { ...hub.headers('reader'), Range: `bytes=${first.length}-`, 'If-Range': `"sha256-${artifact.sha256}"` } });
    assert.equal(rest.status, 206);
    const combined = Buffer.concat([first, Buffer.from(await rest.arrayBuffer())]);
    assert.deepEqual(combined, bytes);
    assert.equal(createHash('sha256').update(combined).digest('hex'), artifact.sha256);
  } finally { await hub.cleanup(); }
});