// File: /scripts/versions.mjs | Version: 0.1.0
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import semver from 'semver';

const excluded = new Set(['.git', '.local', 'node_modules', 'build', 'dist', 'data', 'test-results', 'playwright-report']);
function sourceFiles(root, directory = root) {
  return readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name)).flatMap((entry) => {
    if (excluded.has(entry.name) || entry.name.startsWith('.env')) return [];
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Source symlinks are not supported: ${path}`);
    return entry.isDirectory() ? sourceFiles(root, path) : [relative(root, path).replaceAll('\\', '/')];
  });
}

export function verifyVersions(root, record = false) {
  const inventoryPath = join(root, 'versions.json');
  const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));
  if (!semver.valid(inventory.manifest_version)) throw new Error('Invalid versions.json manifest_version');
  const versions = {};
  const snapshots = {};
  for (const path of sourceFiles(root).filter((file) => file !== 'versions.json')) {
    const content = readFileSync(join(root, path));
    const header = content.toString('utf8', 0, Math.min(600, content.length)).match(/\b(?:Document version|Version):\s*(\d+\.\d+\.\d+)/i);
    const version = header?.[1] ?? inventory.files?.[path];
    if (!semver.valid(version)) throw new Error(`Missing or invalid file version: ${path}`);
    const sha256 = createHash('sha256').update(content).digest('hex');
    const previous = inventory.snapshots?.[path];
    if (record) {
      if (previous && sha256 !== previous.sha256 && !semver.gt(version, previous.version)) {
        throw new Error(`Bump the file version before recording changed contents: ${path} (${previous.version})`);
      }
    } else {
      if (inventory.files?.[path] !== version || previous?.version !== version || previous?.sha256 !== sha256) {
        throw new Error(`Unrecorded file revision: ${path}. Bump its version, then run npm run versions:record`);
      }
    }
    versions[path] = version;
    snapshots[path] = { version, sha256 };
  }
  if (!record && Object.keys(inventory.files).some((path) => !(path in versions))) throw new Error('Stale file paths in versions.json');
  if (record) {
    const next = { manifest_version: inventory.manifest_version, files: versions, snapshots };
    if (JSON.stringify(next) !== JSON.stringify(inventory)) {
      next.manifest_version = semver.inc(inventory.manifest_version, 'patch');
      writeFileSync(inventoryPath, `${JSON.stringify(next, null, 2)}\n`);
    }
  }
  return Object.keys(versions).length + 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const mode = process.argv[2] ?? 'check';
  if (!['check', 'record'].includes(mode)) throw new Error('Usage: node scripts/versions.mjs check|record');
  try { console.log(`File versions ${mode === 'record' ? 'recorded' : 'verified'}: ${verifyVersions(resolve('.'), mode === 'record')} source files`); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}