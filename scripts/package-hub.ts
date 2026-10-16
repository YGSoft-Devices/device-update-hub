// File: /scripts/package-hub.ts | Version: 0.1.0
import { createPrivateKey, sign } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import { packageSchema, readRegular } from '../src/hub-update.js';
import { digestFile, syncDirectory } from '../src/store.js';

try {
  const [specPath, outputPath] = process.argv.slice(2);
  if (!specPath || !outputPath || process.argv.length !== 4 || !process.env.DUH_SIGNING_KEY_FILE) throw new Error('Usage: DUH_SIGNING_KEY_FILE=<protected-path> npm run package:hub -- spec.json output-directory');
  const spec = packageSchema.omit({ image: true }).extend({ image_path: z.string().min(1), image_id: packageSchema.shape.image.shape.id })
    .parse(JSON.parse(readFileSync(resolve(specPath), 'utf8')));
  const key = createPrivateKey(readRegular(resolve(process.env.DUH_SIGNING_KEY_FILE)));
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('An Ed25519 private signing key is required');
  const output = resolve(outputPath);
  mkdirSync(output, { mode: 0o700 });
  try {
    copyFileSync(resolve(dirname(resolve(specPath)), spec.image_path), join(output, 'hub-image.tar'));
    const metadata = packageSchema.parse({ schema_version: spec.schema_version, product: spec.product, version: spec.version,
      channel: spec.channel, target: spec.target, database_schema: spec.database_schema,
      image: { filename: 'hub-image.tar', id: spec.image_id, ...digestFile(join(output, 'hub-image.tar')) } });
    const bytes = Buffer.from(JSON.stringify(metadata));
    writeFileSync(join(output, 'hub-update.json'), bytes, { flag: 'wx', mode: 0o600 });
    writeFileSync(join(output, 'hub-update.sig'), sign(null, bytes, key), { flag: 'wx', mode: 0o600 });
    writeFileSync(join(output, 'release-plan.json'), JSON.stringify({ product: metadata.product, version: metadata.version, channel: metadata.channel,
      release_notes: '', targets: [metadata.target], files: ['hub-update.json', 'hub-update.sig', 'hub-image.tar'] }, null, 2), { flag: 'wx', mode: 0o600 });
    syncDirectory(output);
    console.log(`Signed Hub ${metadata.version} package created. Review release-plan.json before publishing.`);
  } catch (error) { rmSync(output, { recursive: true, force: true }); throw error; }
} catch { console.error('Package creation failed. Check the specification, image and protected Ed25519 key file. No key material is printed.'); process.exitCode = 1; }