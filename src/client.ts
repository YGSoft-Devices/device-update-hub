// File: /src/client.ts | Version: 0.2.0
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, createWriteStream, existsSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream } from 'node:stream/web';
import semver from 'semver';
import { z } from 'zod';
import { checkResultSchema, checkSchema, publishedManifestSchema, sameTarget, type Check, type CheckResult, type PublishedManifest } from './contract.js';
import { digestFile, syncDirectory } from './store.js';

export const plannedOrigin = 'https://updatehub.ygsoft.fr';
const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
export function validateBaseUrl(value: string): URL {
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash
    || (!local && url.origin !== plannedOrigin) || !['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`Use a loopback HTTP(S) origin or the planned HTTPS origin ${plannedOrigin}; paths, credentials and query strings are forbidden`);
  }
  return url;
}
export function readClientToken(role: 'publisher' | 'reader', product: string, environment: NodeJS.ProcessEnv = process.env): string {
  if (environment.DUH_TOKEN && environment.DUH_TOKEN_FILE) throw new Error('Set only one of DUH_TOKEN and DUH_TOKEN_FILE');
  if (environment.DUH_TOKEN) return tokenSchema.parse(environment.DUH_TOKEN.trim());
  if (environment.DUH_TOKEN_FILE) return tokenSchema.parse(readFileSync(resolve(environment.DUH_TOKEN_FILE), 'utf8').trim());
  const credentials = z.array(z.object({ role: z.string(), products: z.array(z.string()), token: tokenSchema }))
    .parse(JSON.parse(readFileSync(resolve(environment.DUH_CREDENTIALS_FILE ?? '.local/credentials.json'), 'utf8')));
  const credential = credentials.find((entry) => entry.role === role && entry.products.includes(product));
  if (!credential) throw new Error(`No scoped ${role} credential for this product`);
  return credential.token;
}
type RequestOptions = { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown; headers?: Record<string, string>; timeoutMs?: number };

export class HubClient {
  readonly #origin: string;
  readonly #token: string;
  constructor(options: { baseUrl?: string; token: string }) {
    this.#origin = validateBaseUrl(options.baseUrl ?? 'http://127.0.0.1:3210').origin;
    this.#token = tokenSchema.parse(options.token);
  }
  private async send(path: string, options: RequestOptions = {}): Promise<Response> {
    if (!/^\/api\/v1\/[a-zA-Z0-9/_-]+$/.test(path)) throw new Error('Only same-origin API v1 paths are allowed');
    const { body } = options;
    return fetch(new URL(path, this.#origin), {
      method: options.method ?? 'GET', redirect: 'error', signal: AbortSignal.timeout(options.timeoutMs ?? (body instanceof FormData || path.endsWith('/download') ? 3600000 : 90000)),
      headers: { ...options.headers, Authorization: `Bearer ${this.#token}`,
        ...(body === undefined || body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }),
    });
  }
  async request<Value>(path: string, options: RequestOptions = {}): Promise<Value> {
    const response = await this.send(path, options);
    const body = await response.json() as Value & { error?: { message?: string } };
    if (!response.ok) throw new Error(`HTTP ${response.status} ${path}: ${body.error?.message ?? 'Request failed'}`);
    return body;
  }
  async check(input: Check): Promise<CheckResult> {
    const check = checkSchema.parse(input);
    const result = checkResultSchema.parse(await this.request('/api/v1/updates/check', { method: 'POST', body: check }));
    if (result.update_available && (result.release.product !== check.product || result.release.channel !== check.channel
      || !semver.gt(result.release.version, check.current_version)
      || (check.channel === 'stable' && semver.prerelease(result.release.version) !== null))) throw new Error('Inconsistent update response');
    return result;
  }
  async manifest(path: string, expected?: Check): Promise<PublishedManifest> {
    const manifest = publishedManifestSchema.parse(await this.request(path));
    if (path !== `/api/v1/releases/${manifest.release_id}/manifest`) throw new Error('Manifest identity does not match the requested release');
    if (expected) {
      const check = checkSchema.parse(expected);
      if (manifest.product !== check.product || manifest.channel !== check.channel
        || !semver.gt(manifest.version, check.current_version) || !manifest.targets.some((target) => sameTarget(target, check.target))
        || (check.channel === 'stable' && semver.prerelease(manifest.version) !== null)) throw new Error('Manifest is not an eligible update for the supplied target');
    }
    return manifest;
  }
  async download(manifestInput: PublishedManifest, outputDirectory: string): Promise<string[]> {
    const manifest = publishedManifestSchema.parse(manifestInput);
    const directory = resolve(outputDirectory);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const paths: string[] = [];
    for (const artifact of manifest.artifacts) {
      if (artifact.filename.endsWith('.')) throw new Error('Artifact filename is not portable');
      const destination = join(directory, artifact.filename);
      if (existsSync(destination)) {
        if (lstatSync(destination).isSymbolicLink() || !lstatSync(destination).isFile()) throw new Error('Existing destination is not a regular file');
        const existing = digestFile(destination);
        if (existing.size !== artifact.size || existing.sha256 !== artifact.sha256) throw new Error(`Existing file differs: ${artifact.filename}`);
        paths.push(destination);
        continue;
      }
      const temporary = join(directory, `.${randomUUID()}.part`);
      try {
        const response = await this.send(artifact.download_url, { headers: { 'Accept-Encoding': 'identity' } });
        if (!response.ok || !response.body) throw new Error(`Artifact download failed: HTTP ${response.status}`);
        let size = 0;
        const hash = createHash('sha256');
        const verify = new Transform({ transform(chunk: Buffer, _encoding, callback) {
          size += chunk.length;
          if (size > artifact.size) return callback(new Error('Artifact exceeds its declared size'));
          hash.update(chunk);
          callback(null, chunk);
        } });
        await pipeline(Readable.fromWeb(response.body as ReadableStream<Uint8Array>), verify,
          createWriteStream(temporary, { flags: 'wx', mode: 0o600 }));
        if (size !== artifact.size || hash.digest('hex') !== artifact.sha256) throw new Error('Artifact checksum or size mismatch');
        const descriptor = openSync(temporary, 'r+');
        try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
        linkSync(temporary, destination);
        syncDirectory(directory);
        paths.push(destination);
      } finally { rmSync(temporary, { force: true }); }
    }
    return paths;
  }
}