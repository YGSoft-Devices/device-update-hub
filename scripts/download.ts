// File: /scripts/download.ts | Version: 0.1.0
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { HubClient, readClientToken } from '../src/client.js';
import { checkSchema } from '../src/contract.js';

async function main() {
  const [checkPath, releaseId, outputDirectory] = process.argv.slice(2);
  if (!checkPath || !releaseId || !outputDirectory || process.argv.length !== 5) {
    throw new Error('Usage: npm run download:release -- path/to/check.json release-uuid output-directory');
  }
  const id = z.uuid().parse(releaseId);
  const check = checkSchema.parse(JSON.parse(readFileSync(resolve(checkPath), 'utf8')));
  const client = new HubClient({ baseUrl: process.env.DUH_BASE_URL, token: readClientToken('reader', check.product) });
  const manifest = await client.manifest(`/api/v1/releases/${id}/manifest`, check);
  const files = await client.download(manifest, outputDirectory);
  console.log(JSON.stringify({ release_id: manifest.release_id, version: manifest.version, verified_files: files, installed: false }, null, 2));
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Download failed'); process.exitCode = 1; });