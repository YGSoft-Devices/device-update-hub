// File: /src/server.ts | Version: 0.1.0
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildApp, credentialsSchema } from './app.js';

const directory = resolve(process.env.DUH_DATA_DIR ?? '.local/data');
const credentialFile = resolve(process.env.DUH_CREDENTIALS_FILE ?? '.local/credentials.json');
const host = process.env.DUH_HOST ?? '127.0.0.1';
const port = Number(process.env.DUH_PORT ?? 3210);
if (!['127.0.0.1', '::1', 'localhost'].includes(host) && process.env.DUH_CONTAINER !== '1') {
  throw new Error('Non-loopback binding is only allowed inside the local container deployment');
}
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid DUH_PORT');
try {
  const credentials = credentialsSchema.parse(JSON.parse(readFileSync(credentialFile, 'utf8')));
  const { app } = await buildApp({ directory, credentials });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => { void app.close().then(() => process.exit(0)); });
  }
  await app.listen({ host, port });
  console.log(`Device Update Hub listening on http://${host}:${port} (local MVP only)`);
} catch {
  console.error('Startup failed. Check local credentials, port availability and data directory permissions. Run npm run init first.');
  process.exitCode = 1;
}