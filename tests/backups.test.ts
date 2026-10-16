// File: /tests/backups.test.ts | Version: 0.2.1
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Backups, HostBackups, backupConfigSchema, type BackupRunner } from '../src/backups.js';
import { Store } from '../src/store.js';
import type { Deployment } from '../src/hub-update.js';
import { buildApp } from '../src/app.js';

test('encrypted Synology settings, offline backup ordering, schedules, redaction and failure recovery', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'duh-backups-')); const store = new Store(join(directory, 'data'));
  const options = { inbox: join(directory, 'inbox'), status: join(directory, 'status'), key: randomBytes(32), privateDirectory: join(directory, 'private'), configDirectory: join(directory, 'config') };
  for (const path of [options.inbox, options.status, options.privateDirectory, options.configDirectory]) mkdirSync(path);
  writeFileSync(join(options.configDirectory, 'policy.json'), '{}');
  const actor = { id: 'admin', role: 'admin' as const, products: [] }; const actions: string[] = [];
  const password = randomBytes(24).toString('hex'); const recoveryPassword = randomBytes(24).toString('hex');
  const config = { enabled: true, host: '192.168.1.50', share: 'backups', directory: 'device-update-hub', username: 'backup', domain: '', smb3_only: true as const,
    password, recovery_password: recoveryPassword, utc_time: '02:00', daily: 7, weekly: 4, monthly: 6 };
  const backups = new Backups(options, store); let fail = false; let wrongSnapshot = false;
  const deployment: Deployment = { async current() { return { image: 'pinned-image', version: '0.2.0' }; }, async load() {},
    async stop() { actions.push('stop'); }, async start() { actions.push('start'); }, async healthy() { actions.push('healthy'); return true; }, async restore() {},
    async backup(path) { actions.push('local-copy'); mkdirSync(join(path, 'backup')); writeFileSync(join(path, 'backup', 'data.tar'), 'fixture'); } };
  const runner: BackupRunner = async (program, args, details) => {
    assert.equal(args.join(' ').includes(password), false); assert.equal(args.join(' ').includes(recoveryPassword), false);
    if (args[0] === 'obscure') { assert.equal(details.input, password); return 'obscured_secret'; }
    actions.push(`${program}:${args[0]}`);
    if (args[0] === 'backup') {
      assert.equal(actions.indexOf('start') < actions.indexOf('restic:backup'), true);
      if (fail) throw new Error(password);
      return `${JSON.stringify({ message_type: 'summary', snapshot_id: 'a'.repeat(8) })}\n`;
    }
    if (args[0] === 'snapshots') {
      if (args[2]) { assert.equal(args[2], 'a'.repeat(8)); return JSON.stringify([{ id: (wrongSnapshot ? 'b' : 'a').repeat(64) }]); }
      return '[]';
    }
    return '';
  };
  try {
    assert.equal(backupConfigSchema.safeParse({ ...config, host: '127.0.0.1' }).success, false);
    assert.equal(backupConfigSchema.safeParse({ ...config, share: '../escape' }).success, false);
    assert.equal(backupConfigSchema.safeParse({ ...config, smb3_only: false }).success, false);
    backups.save(config, actor);
    assert.equal(readFileSync(join(options.inbox, 'backup-config.json'), 'utf8').includes(password), false);
    assert.equal(JSON.stringify(backups.settings()).includes(recoveryPassword), false);
    assert.throws(() => backups.save({ ...config, recovery_password: randomBytes(24).toString('hex') }, actor));
    const host = new HostBackups(options, deployment, runner); assert.equal(backups.ready(), true);
    backups.enqueue('backup', actor); assert.throws(() => backups.enqueue('backup', actor));
    await host.once(); assert.equal(backups.job()?.state, 'succeeded'); assert.equal(backups.job()?.snapshot, 'a'.repeat(64));
    assert.deepEqual(actions.slice(-8), ['stop', 'local-copy', 'start', 'healthy', 'restic:backup', 'restic:snapshots', 'restic:check', 'restic:forget']);
    const count = actions.length; await host.once(new Date('2026-10-16T03:00:00Z')); const afterSchedule = actions.length;
    assert.ok(afterSchedule > count); await host.once(new Date('2026-10-16T04:00:00Z')); assert.equal(actions.length, afterSchedule);
    actions.length = 0; fail = true; backups.enqueue('backup', actor); await host.once();
    assert.equal(backups.job()?.state, 'failed'); assert.equal(backups.maintenance(), false);
    assert.equal(actions.includes('restic:forget'), false); assert.equal(JSON.stringify(backups.job()).includes(password), false);
    const job = backups.job()!; assert.equal(existsSync(join(options.privateDirectory, `backup-${job.id}`, 'source', 'backup', 'data.tar')), true);
    assert.equal(existsSync(join(options.privateDirectory, `backup-${job.id}`, 'repository-password')), false);
    assert.equal(JSON.stringify(store.events()).includes(password), false);
    actions.length = 0; fail = false; wrongSnapshot = true; backups.enqueue('backup', actor); await host.once();
    assert.equal(backups.job()?.state, 'failed'); assert.equal(actions.includes('restic:forget'), false);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('backup API requires admin rights and never returns stored destination secrets', async () => {
  const root = mkdtempSync(join(tmpdir(), 'duh-backup-api-'));
  const options = { inbox: join(root, 'inbox'), status: join(root, 'status'), key: randomBytes(32) };
  mkdirSync(options.inbox); mkdirSync(options.status);
  const credentials = (['admin', 'reader'] as const).map((role) => ({ id: role, role, products: [], token: randomBytes(32).toString('hex') }));
  const hub = await buildApp({ directory: join(root, 'data'), credentials, backups: options });
  const headers = { authorization: `Bearer ${credentials[0]!.token}` }; const password = randomBytes(24).toString('hex');
  try {
    assert.equal((await hub.app.inject({ url: '/api/v1/admin/backups' })).statusCode, 401);
    assert.equal((await hub.app.inject({ url: '/api/v1/admin/backups', headers: { authorization: `Bearer ${credentials[1]!.token}` } })).statusCode, 403);
    const response = await hub.app.inject({ method: 'PUT', url: '/api/v1/admin/backups', headers, payload: { enabled: false, host: '192.168.1.50', share: 'backups', directory: 'hub', username: 'backup', domain: '', smb3_only: true, password, recovery_password: password, utc_time: '02:00', daily: 7, weekly: 4, monthly: 6 } });
    assert.equal(response.statusCode, 200); assert.equal(response.body.includes(password), false);
    assert.equal((await hub.app.inject({ url: '/api/v1/admin/backups', headers })).body.includes(password), false);
    assert.equal((await hub.app.inject({ method: 'POST', url: '/api/v1/admin/backups/backup', headers })).statusCode, 503);
  } finally { await hub.app.close(); rmSync(root, { recursive: true, force: true }); }
});