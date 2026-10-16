// File: /src/server.ts | Version: 0.3.0
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildApp, credentialsSchema } from './app.js';
import { targetSchema } from './contract.js';

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
  const applicationVersion = JSON.parse(readFileSync(resolve('package.json'), 'utf8')).version as string;
  const updateConfig = process.env.DUH_UPDATE_CONFIG_FILE ? JSON.parse(readFileSync(resolve(process.env.DUH_UPDATE_CONFIG_FILE), 'utf8')) as {
    inbox: string; status: string; public_key_file: string; target: unknown; channel: string;
  } : null;
  const { app } = await buildApp({ directory, credentials, applicationVersion,
    ...(updateConfig && process.env.DUH_BACKUP_KEY_FILE ? { backups: { inbox: updateConfig.inbox, status: updateConfig.status,
      key: readFileSync(resolve(process.env.DUH_BACKUP_KEY_FILE)) } } : {}),
    ...(updateConfig ? { hubUpdate: { inbox: updateConfig.inbox, status: updateConfig.status,
      publicKey: readFileSync(updateConfig.public_key_file, 'utf8'), target: targetSchema.parse(updateConfig.target),
      currentVersion: applicationVersion, channel: updateConfig.channel } } : {}),
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => { void app.close().then(() => process.exit(0)); });
  }
  await app.listen({ host, port });
  console.log(`Device Update Hub listening on http://${host}:${port} (local MVP only)`);
} catch {
  console.error('Startup failed. Check local credentials, port availability and data directory permissions. Run npm run init first.');
  process.exitCode = 1;
}