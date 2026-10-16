// File: /tests/versions.test.ts | Version: 0.1.1
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const checker = new URL('../scripts/versions.mjs', import.meta.url);
test('file inventory rejects forgotten versions and changed contents without a version increment', () => {
  const root = mkdtempSync(join(tmpdir(), 'duh versions '));
  const run = (mode: string) => execFileSync(process.execPath, [fileURLToPath(checker), mode], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
  try {
    writeFileSync(join(root, 'versions.json'), JSON.stringify({ manifest_version: '0.1.0', files: {} }));
    writeFileSync(join(root, 'sample.txt'), 'unversioned');
    assert.throws(() => run('record'), /Missing or invalid file version/);
    writeFileSync(join(root, 'sample.txt'), 'File: /sample.txt | Version: 0.1.0\nOriginal');
    assert.match(run('record'), /recorded: 2 source files/);
    assert.match(run('check'), /verified: 2 source files/);
    writeFileSync(join(root, 'sample.txt'), 'File: /sample.txt | Version: 0.1.0\nChanged');
    assert.throws(() => run('check'), /Unrecorded file revision/);
    assert.throws(() => run('record'), /Bump the file version/);
    writeFileSync(join(root, 'sample.txt'), 'File: /sample.txt | Version: 0.1.1\nChanged');
    run('record');
    run('check');
    const inventory = JSON.parse(readFileSync(join(root, 'versions.json'), 'utf8')) as { files: Record<string, string> };
    assert.equal(inventory.files['sample.txt'], '0.1.1');
  } finally { rmSync(root, { recursive: true, force: true }); }
});