// File: /scripts/init.ts | Version: 0.1.0
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { slug } from '../src/contract.js';

const product = slug.parse(process.env.DUH_PRODUCT ?? 'meeting-agent');
const path = resolve(process.env.DUH_CREDENTIALS_FILE ?? '.local/credentials.json');
mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
try {
  const credentials = (['admin', 'publisher', 'reader'] as const).map((role) => ({
    id: `local-${role}`, role, products: role === 'admin' ? [] : [product], token: randomBytes(32).toString('hex'),
  }));
  writeFileSync(path, `${JSON.stringify(credentials, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  console.log(`Credentials created in ${path}. Tokens are not printed. Restrict this file to your OS account.`);
  console.log(`Publisher and reader are scoped to product: ${product}. Create this product through the admin UI.`);
} catch (error) {
  if ((error as NodeJS.ErrnoException).code === 'EEXIST') console.log('Credentials already exist; nothing was overwritten.');
  else throw error;
}