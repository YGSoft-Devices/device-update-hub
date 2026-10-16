// File: /src/store.ts | Version: 0.1.0
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import semver from 'semver';
import { permits, type Artifact, type Draft, type ManifestInput, type Principal, type Release } from './contract.js';

export class HubError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export function demand(condition: unknown, status: number, code: string, message: string): asserts condition {
  if (!condition) throw new HubError(status, code, message);
}
export function digestFile(path: string): { sha256: string; size: number } {
  const descriptor = openSync(path, 'r');
  const hash = createHash('sha256');
  const buffer = Buffer.alloc(65536);
  let size = 0;
  try {
    let count: number;
    while ((count = readSync(descriptor, buffer)) > 0) {
      hash.update(buffer.subarray(0, count));
      size += count;
    }
    return { sha256: hash.digest('hex'), size };
  } finally { closeSync(descriptor); }
}
export function syncDirectory(path: string): void {
  if (process.platform === 'win32') return;
  const descriptor = openSync(path, 'r');
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}

export class Store {
  readonly db: DatabaseSync;
  readonly blobs: string;
  readonly staging: string;
  constructor(readonly directory: string) {
    this.blobs = join(directory, 'blobs');
    this.staging = join(directory, 'staging');
    mkdirSync(this.blobs, { recursive: true, mode: 0o700 });
    mkdirSync(this.staging, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(join(directory, 'catalog.db'));
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
    const schema = this.db.prepare('PRAGMA user_version').get() as { user_version: number };
    demand(schema.user_version === 0 || schema.user_version === 1, 500, 'schema_version', 'Unsupported database schema');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS releases (
        id TEXT PRIMARY KEY, product TEXT NOT NULL REFERENCES products(id),
        channel TEXT NOT NULL, version TEXT NOT NULL, body TEXT NOT NULL,
        UNIQUE(product, channel, version)
      );
      CREATE TABLE IF NOT EXISTS idempotency (
        principal TEXT NOT NULL, key TEXT NOT NULL, request TEXT NOT NULL,
        release_id TEXT NOT NULL REFERENCES releases(id), PRIMARY KEY(principal, key)
      );
      CREATE TABLE IF NOT EXISTS audit (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL,
        actor TEXT NOT NULL, action TEXT NOT NULL, resource TEXT NOT NULL
      );
      PRAGMA user_version=1;
    `);
  }
  close(): void { this.db.close(); }
  transaction<Value>(operation: () => Value): Value {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = operation(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  audit(principal: Principal, action: string, resource: string): void {
    this.db.prepare('INSERT INTO audit(at,actor,action,resource) VALUES(?,?,?,?)')
      .run(new Date().toISOString(), principal.id, action, resource);
  }
  events(): unknown[] { return this.db.prepare('SELECT * FROM audit ORDER BY sequence DESC LIMIT 100').all(); }
  products(principal: Principal): { id: string; name: string }[] {
    return (this.db.prepare('SELECT * FROM products ORDER BY id').all() as { id: string; name: string }[])
      .filter((product) => permits(principal, product.id));
  }
  createProduct(product: { id: string; name: string }, principal: Principal): void {
    this.transaction(() => {
      demand(!this.db.prepare('SELECT id FROM products WHERE id=?').get(product.id), 409, 'product_exists', 'Product already exists');
      this.db.prepare('INSERT INTO products(id,name) VALUES(?,?)').run(product.id, product.name);
      this.audit(principal, 'product.created', product.id);
    });
  }
  list(principal: Principal): Release[] {
    return (this.db.prepare('SELECT body FROM releases ORDER BY rowid DESC').all() as { body: string }[])
      .map((row) => JSON.parse(row.body) as Release).filter((release) => permits(principal, release.product));
  }
  get(id: string, principal: Principal): Release {
    const row = this.db.prepare('SELECT body FROM releases WHERE id=?').get(id) as { body: string } | undefined;
    demand(row, 404, 'not_found', 'Release not found');
    const release = JSON.parse(row.body) as Release;
    demand(permits(principal, release.product), 403, 'forbidden', 'Product access denied');
    return release;
  }
  private save(release: Release): void {
    const conflict = this.db.prepare('SELECT id FROM releases WHERE product=? AND channel=? AND version=? AND id<>?')
      .get(release.product, release.channel, release.version, release.id);
    demand(!conflict, 409, 'version_exists', 'This product/channel/version is already reserved');
    this.db.prepare('INSERT INTO releases(id,product,channel,version,body) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET channel=excluded.channel,version=excluded.version,body=excluded.body')
      .run(release.id, release.product, release.channel, release.version, JSON.stringify(release));
  }
  create(draft: Draft, key: string, principal: Principal): Release {
    return this.transaction(() => {
      demand(permits(principal, draft.product), 403, 'forbidden', 'Product access denied');
      const request = createHash('sha256').update(JSON.stringify(draft)).digest('hex');
      const previous = this.db.prepare('SELECT request,release_id FROM idempotency WHERE principal=? AND key=?')
        .get(principal.id, key) as { request: string; release_id: string } | undefined;
      if (previous) {
        demand(previous.request === request, 409, 'idempotency_conflict', 'Idempotency key was used with different input');
        return this.get(previous.release_id, principal);
      }
      demand(this.db.prepare('SELECT id FROM products WHERE id=?').get(draft.product), 404, 'product_not_found', 'Create the product first');
      const release: Release = { ...draft, id: randomUUID(), status: 'draft', created_at: new Date().toISOString(),
        published_at: null, artifacts: [], manifest: null };
      this.save(release);
      this.db.prepare('INSERT INTO idempotency(principal,key,request,release_id) VALUES(?,?,?,?)').run(principal.id, key, request, release.id);
      this.audit(principal, 'release.created', release.id);
      return release;
    });
  }
  mutateDraft(id: string, principal: Principal, action: string, mutate: (release: Release) => void): Release {
    return this.transaction(() => {
      const release = this.get(id, principal);
      demand(release.status === 'draft', 409, 'immutable_release', 'Only drafts can be modified');
      mutate(release);
      this.save(release);
      this.audit(principal, action, id);
      return release;
    });
  }
  edit(id: string, draft: Draft, principal: Principal): Release {
    return this.mutateDraft(id, principal, 'release.edited', (release) => {
      demand(draft.product === release.product, 409, 'immutable_product', 'A release cannot change product');
      Object.assign(release, draft, { manifest: null });
    });
  }
  attach(id: string, artifact: Artifact, principal: Principal): Release {
    return this.mutateDraft(id, principal, 'artifact.attached', (release) => {
      const previous = release.artifacts.find((entry) => entry.filename === artifact.filename);
      if (previous) {
        demand(previous.sha256 === artifact.sha256 && previous.size === artifact.size, 409, 'filename_conflict', 'Remove the draft artifact before replacing it');
        return;
      }
      demand(release.artifacts.length < 32, 413, 'artifact_limit', 'Maximum 32 artifacts per release');
      release.artifacts.push(artifact);
      release.manifest = null;
    });
  }
  detach(id: string, artifactId: string, principal: Principal): Release {
    return this.mutateDraft(id, principal, 'artifact.detached', (release) => {
      demand(release.artifacts.some((artifact) => artifact.id === artifactId), 404, 'not_found', 'Artifact not found');
      release.artifacts = release.artifacts.filter((artifact) => artifact.id !== artifactId);
      release.manifest = null;
    });
  }
  setManifest(id: string, manifest: ManifestInput, principal: Principal): Release {
    return this.mutateDraft(id, principal, 'manifest.updated', (release) => {
      demand(manifest.artifact_order.length === release.artifacts.length
        && manifest.artifact_order.every((artifactId) => release.artifacts.some((artifact) => artifact.id === artifactId)),
      422, 'invalid_manifest', 'Manifest must contain every uploaded artifact exactly once');
      release.manifest = manifest;
    });
  }
  artifactPath(artifact: Artifact): string { return join(this.blobs, artifact.sha256); }
  verify(artifact: Artifact): boolean {
    const path = this.artifactPath(artifact);
    if (!existsSync(path) || !statSync(path).isFile()) return false;
    const result = digestFile(path);
    return result.size === artifact.size && result.sha256 === artifact.sha256;
  }
  validate(release: Release): string[] {
    const errors: string[] = [];
    if (release.status === 'withdrawn') errors.push('Release is withdrawn');
    if (release.channel === 'stable' && semver.prerelease(release.version)) errors.push('Stable releases cannot be prereleases');
    if (!release.artifacts.length) errors.push('At least one artifact is required');
    if (!release.manifest || release.manifest.artifact_order.length !== release.artifacts.length
      || !release.artifacts.every((artifact) => release.manifest?.artifact_order.includes(artifact.id))) errors.push('Complete manifest is required');
    for (const artifact of release.artifacts) {
      if (!this.verify(artifact)) errors.push(`Artifact integrity failed: ${artifact.id}`);
    }
    return errors;
  }
  publish(id: string, principal: Principal): Release {
    return this.transaction(() => {
      const release = this.get(id, principal);
      if (release.status === 'published') return release;
      demand(release.status === 'draft', 409, 'immutable_release', 'Withdrawn releases cannot be republished');
      demand(this.validate(release).length === 0, 422, 'invalid_release', 'Validate the release and resolve all errors before publishing');
      release.status = 'published';
      release.published_at = new Date().toISOString();
      this.save(release);
      this.audit(principal, 'release.published', id);
      return release;
    });
  }
  withdraw(id: string, principal: Principal): Release {
    return this.transaction(() => {
      const release = this.get(id, principal);
      if (release.status === 'withdrawn') return release;
      demand(release.status === 'published', 409, 'invalid_transition', 'Only published releases can be withdrawn');
      release.status = 'withdrawn';
      this.save(release);
      this.audit(principal, 'release.withdrawn', id);
      return release;
    });
  }
}