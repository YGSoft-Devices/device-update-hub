// File: /tests/contract.test.ts | Version: 0.1.1
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkSchema, version, fileNameSchema, manifestInputSchema, selectRelease, type Check, type Principal, type Release } from '../src/contract.js';

const target = { device_type: 'rpi-camera', os: 'linux', architecture: 'arm64', hardware_revision: 'rev-b', updater_protocol: 1 as const };
const reader: Principal = { id: 'test-reader', role: 'reader', products: ['meeting-agent'] };
const check: Check = { product: 'meeting-agent', current_version: '1.0.0', channel: 'stable', target };
function release(version: string, overrides: Partial<Release> = {}): Release {
  return { id: crypto.randomUUID(), product: 'meeting-agent', version, channel: 'stable', release_notes: '',
    targets: [target], status: 'published', created_at: new Date().toISOString(), published_at: null,
    artifacts: [], manifest: null, ...overrides };
}

test('selects newest eligible SemVer, not lexicographic version', () => {
  assert.equal(selectRelease([release('1.9.0'), release('1.10.0')], check, reader)?.version, '1.10.0');
});
test('filters status, product, channel, platform, permission and prereleases before ordering', () => {
  const invalid = [release('9.0.0', { status: 'draft' }), release('8.0.0', { status: 'withdrawn' }),
    release('7.0.0', { product: 'other' }), release('6.0.0', { channel: 'beta' }),
    release('5.0.0', { targets: [{ ...target, architecture: 'x64' }] }), release('4.0.0-beta.1')];
  assert.equal(selectRelease(invalid, check, reader), undefined);
  assert.equal(selectRelease([release('2.0.0')], check, { ...reader, products: [] }), undefined);
  for (const field of ['device_type', 'os', 'architecture', 'hardware_revision'] as const) {
    assert.equal(selectRelease([release('2.0.0', { targets: [{ ...target, [field]: 'other' }] })], check, reader), undefined);
  }
});
test('does not offer current or older versions; beta ordering is semantic', () => {
  assert.equal(selectRelease([release('1.0.0'), release('0.9.0')], check, reader), undefined);
  assert.equal(selectRelease([release('2.0.0-beta.2', { channel: 'beta' }), release('2.0.0-beta.10', { channel: 'beta' })],
    { ...check, channel: 'beta' }, reader)?.version, '2.0.0-beta.10');
});
test('rejects ambiguous versions, unknown commands, unsafe names and duplicate manifest entries', () => {
  assert.equal(checkSchema.safeParse({ ...check, command: 'run' }).success, false);
  assert.equal(version.safeParse('1.0.0+build').success, false);
  assert.equal(version.safeParse('v1.0.0').success, false);
  for (const filename of ['../payload', 'a/b', 'a\\b', 'CON.bin', '..', '.hidden']) {
    assert.equal(fileNameSchema.safeParse(filename).success, false);
  }
  const id = crypto.randomUUID();
  assert.equal(manifestInputSchema.safeParse({ schema_version: '1', artifact_order: [id, id] }).success, false);
  assert.equal(checkSchema.safeParse({ ...check, target: { ...target, updater_protocol: 2 } }).success, false);
});