// File: /scripts/e2e-server.ts | Version: 0.1.0
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildApp, type Credentials } from '../src/app.js';

const directory = mkdtempSync(join(tmpdir(), 'duh-browser-'));
const credentials: Credentials = (['admin', 'publisher', 'reader'] as const).map((role) => ({
  id: `browser-${role}`, role, products: role === 'admin' ? [] : ['demo-desktop', 'demo-mobile'], token: randomBytes(32).toString('hex'),
}));
const credentialFile = resolve('.local/e2e/credentials.json');
mkdirSync(resolve('.local/e2e'), { recursive: true, mode: 0o700 });
writeFileSync(credentialFile, JSON.stringify(credentials), { mode: 0o600 });
const { app } = await buildApp({ directory, credentials });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => {
  void app.close().then(() => { rmSync(directory, { recursive: true, force: true }); rmSync(credentialFile, { force: true }); process.exit(0); });
});
await app.listen({ host: '127.0.0.1', port: Number(process.env.DUH_E2E_PORT ?? 3211) });