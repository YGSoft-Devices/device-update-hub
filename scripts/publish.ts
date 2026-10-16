// File: /scripts/publish.ts | Version: 0.2.0
import { createHash } from 'node:crypto';
import { openAsBlob, readFileSync, statSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { z } from 'zod';
import { HubClient, readClientToken } from '../src/client.js';
import { draftSchema, fileNameSchema, type Release } from '../src/contract.js';
import { digestFile } from '../src/store.js';

async function main() {
  const argument = process.argv[2];
  if (!argument) throw new Error('Usage: npm run publish:release -- path/to/plan.json');
  const planPath = resolve(argument);
  const { files, ...draft } = draftSchema.extend({ files: z.array(z.string().min(1)).min(1).max(32) })
    .parse(JSON.parse(readFileSync(planPath, 'utf8')));
  const client = new HubClient({ baseUrl: process.env.DUH_BASE_URL, token: readClientToken('publisher', draft.product) });
  const inventory = files.map((file) => {
    const path = resolve(dirname(planPath), file);
    const filename = fileNameSchema.parse(basename(path));
    const size = statSync(path).size;
    if (size <= 0 || size > 64 * 1024 * 1024) throw new Error(`Invalid artifact size: ${filename}`);
    return { path, filename, ...digestFile(path) };
  });
  if (new Set(inventory.map((file) => file.filename)).size !== inventory.length) throw new Error('Artifact basenames must be unique');
  async function call<Value>(path: string, method: 'POST' | 'PUT' = 'POST', body?: unknown, headers: Record<string, string> = {}): Promise<Value> {
    return client.request<Value>(`/api/v1${path}`, { method, body, headers });
  }
  const key = `publish-${createHash('sha256').update(JSON.stringify([draft.product, draft.channel, draft.version])).digest('hex')}`;
  let release = await call<Release>('/publishing/releases', 'POST', draft, { 'Idempotency-Key': key });
  if (release.status === 'withdrawn') throw new Error('This release has been withdrawn; use a new version');
  if (release.status === 'draft') {
    for (const file of inventory) {
      const form = new FormData(); form.append('file', await openAsBlob(file.path), file.filename);
      release = await call<Release>(`/publishing/releases/${release.id}/artifacts`, 'POST', form);
    }
  }
  if (release.artifacts.length !== inventory.length || !inventory.every((file) => release.artifacts.some((artifact) => artifact.filename === file.filename
    && artifact.size === file.size && artifact.sha256 === file.sha256))) throw new Error('Stored inventory differs from the local plan; refusing publication');
  const artifactOrder = inventory.map((file) => release.artifacts.find((artifact) => artifact.filename === file.filename)!.id);
  if (release.status === 'published') {
    if (JSON.stringify(release.manifest?.artifact_order) !== JSON.stringify(artifactOrder)) throw new Error('Published artifact order differs from the local plan');
  } else {
    await call(`/publishing/releases/${release.id}/manifest`, 'PUT', { schema_version: '1', artifact_order: artifactOrder });
    const validation = await call<{ valid: boolean; errors: string[] }>(`/publishing/releases/${release.id}/validate`);
    if (!validation.valid) throw new Error(validation.errors.join('; '));
    release = await call<Release>(`/publishing/releases/${release.id}/publish`);
  }
  console.log(`Published ${release.product} ${release.version} (${release.id}), ${release.artifacts.length} artifacts. Safe to retry the same plan.`);
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Publication failed'); process.exitCode = 1; });