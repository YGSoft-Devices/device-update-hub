// File: /scripts/check.ts | Version: 0.1.0
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HubClient, readClientToken } from '../src/client.js';
import { checkSchema } from '../src/contract.js';

async function main() {
  const argument = process.argv[2];
  if (!argument || process.argv.length !== 3) throw new Error('Usage: npm run check:update -- path/to/check.json');
  const input = checkSchema.parse(JSON.parse(readFileSync(resolve(argument), 'utf8')));
  const client = new HubClient({ baseUrl: process.env.DUH_BASE_URL, token: readClientToken('reader', input.product) });
  console.log(JSON.stringify(await client.check(input), null, 2));
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Check failed'); process.exitCode = 1; });