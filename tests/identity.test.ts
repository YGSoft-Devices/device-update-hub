// File: /tests/identity.test.ts | Version: 0.2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../src/app.js';

test('accounts persist, enforce scopes, revoke sessions/tokens and protect the final administrator', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'duh-identity-'));
  const bootstrap = randomBytes(32).toString('hex'); const password = randomBytes(24).toString('hex');
  const credentials = [{ id: 'bootstrap', role: 'admin' as const, products: [], token: bootstrap }];
  let hub = await buildApp({ directory, credentials });
  const headers = { authorization: `Bearer ${bootstrap}` };
  const origin = { origin: 'https://hub.test', host: 'hub.test' };
  try {
    const input = { username: 'alice', name: 'Alice', role: 'admin', products: [], enabled: true, password };
    const create = await hub.app.inject({ method: 'POST', url: '/api/v1/admin/users', headers, payload: input });
    assert.equal(create.statusCode, 201); const user = create.json(); assert.equal(user.password_hash, undefined);
    assert.equal((await hub.app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: origin, payload: { username: 'nobody', password } })).statusCode, 401);
    const login = await hub.app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: origin, payload: { username: 'alice', password } });
    assert.equal(login.statusCode, 200); const cookie = String(login.headers['set-cookie']).split(';')[0]!;
    assert.match(String(login.headers['set-cookie']), /HttpOnly.*SameSite=Strict.*Secure/);
    assert.equal((await hub.app.inject({ url: '/api/v1/session', headers: { cookie } })).json().id, user.id);
    const edit = { username: 'alice', name: 'Alice', role: 'admin', products: [], enabled: false };
    assert.equal((await hub.app.inject({ method: 'PUT', url: `/api/v1/admin/users/${user.id}`, headers, payload: edit })).statusCode, 409);
    assert.equal((await hub.app.inject({ method: 'POST', url: '/api/v1/admin/products', headers: { cookie }, payload: { id: 'example', name: 'Example' } })).statusCode, 403);
    assert.equal((await hub.app.inject({ method: 'POST', url: '/api/v1/admin/products', headers: { cookie, ...origin }, payload: { id: 'example', name: 'Example' } })).statusCode, 201);
    const reader = (await hub.app.inject({ method: 'POST', url: '/api/v1/admin/users', headers, payload: { ...input, username: 'reader', role: 'reader', products: ['example'] } })).json();
    const issued = (await hub.app.inject({ method: 'POST', url: `/api/v1/admin/users/${reader.id}/tokens`, headers, payload: { name: 'Client', days: 1 } })).json();
    const readerHeaders = { authorization: `Bearer ${issued.token}` };
    assert.equal((await hub.app.inject({ url: '/api/v1/admin/users', headers: readerHeaders })).statusCode, 403);
    assert.equal((await hub.app.inject({ url: '/api/v1/session', headers: readerHeaders })).json().role, 'reader');
    assert.equal((await hub.app.inject({ url: `/api/v1/admin/users/${reader.id}/tokens`, headers })).body.includes(issued.token), false);
    await hub.app.close(); hub = await buildApp({ directory, credentials });
    assert.equal((await hub.app.inject({ url: '/api/v1/session', headers: { cookie } })).statusCode, 200);
    const nextPassword = randomBytes(24).toString('hex');
    assert.equal((await hub.app.inject({ method: 'PUT', url: `/api/v1/admin/users/${user.id}/password`, headers, payload: { password: nextPassword } })).statusCode, 200);
    assert.equal((await hub.app.inject({ url: '/api/v1/session', headers: { cookie } })).statusCode, 401);
    assert.equal((await hub.app.inject({ method: 'PUT', url: `/api/v1/admin/users/${reader.id}`, headers, payload: { username: 'reader', name: 'Reader', role: 'reader', products: ['example'], enabled: false } })).statusCode, 200);
    assert.equal((await hub.app.inject({ url: '/api/v1/session', headers: readerHeaders })).statusCode, 401);
    assert.equal((await hub.app.inject({ method: 'PUT', url: `/api/v1/admin/users/${reader.id}`, headers, payload: { username: 'reader', name: 'Reader', role: 'reader', products: ['example'], enabled: true } })).statusCode, 200);
    assert.equal((await hub.app.inject({ url: '/api/v1/session', headers: readerHeaders })).statusCode, 401);
    assert.equal((await hub.app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin: 'https://evil.test', host: 'hub.test' }, payload: { username: 'alice', password: nextPassword } })).statusCode, 403);
    const record = hub.store.db.prepare('SELECT password_hash FROM users WHERE id=?').get(user.id) as { password_hash: string };
    assert.match(record.password_hash, /^\$argon2id\$/); assert.equal(record.password_hash.includes(password), false);
    assert.equal(JSON.stringify(hub.store.events()).includes(nextPassword), false);
  } finally { await hub.app.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('schema 2 migrates to 3 preserving metadata/settings and existing bootstrap access', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'duh-migration-'));
  const credentials = [{ id: 'bootstrap', role: 'admin' as const, products: [], token: randomBytes(32).toString('hex') }];
  let hub = await buildApp({ directory, credentials });
  const principal = { id: 'bootstrap', role: 'admin' as const, products: [] };
  try {
    hub.store.createProduct({ id: 'sample', name: 'Sample' }, principal);
    hub.store.setSettings({ upload_max_bytes: 1000000, upload_timeout_seconds: 120 }, principal);
    const events = hub.store.events();
    hub.store.db.exec('DROP TABLE sessions; DROP TABLE api_tokens; DROP TABLE users; PRAGMA user_version=2;');
    await hub.app.close(); hub = await buildApp({ directory, credentials });
    assert.equal((hub.store.db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, 3);
    assert.equal(hub.store.settings().upload_max_bytes, 1000000); assert.deepEqual(hub.store.events(), events);
    assert.equal(hub.store.products(principal)[0]?.id, 'sample');
    assert.equal((await hub.app.inject({ url: '/api/v1/admin/users', headers: { authorization: `Bearer ${credentials[0]!.token}` } })).statusCode, 200);
  } finally { await hub.app.close(); rmSync(directory, { recursive: true, force: true }); }
});