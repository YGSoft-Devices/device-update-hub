// File: /src/app.ts | Version: 0.4.1
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { closeSync, createReadStream, createWriteStream, existsSync, fsyncSync, openSync, renameSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Transform } from 'node:stream';
import { finished, pipeline } from 'node:stream/promises';
import Fastify, { type FastifyRequest } from 'fastify';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { z, ZodError } from 'zod';
import { adminSettingsSchema, checkSchema, draftSchema, fileNameSchema, manifestInputSchema, permits, productSchema, selectRelease, type Artifact, type Principal } from './contract.js';
import { demand, digestFile, HubError, Store, syncDirectory } from './store.js';
import { HubUpdates, type HubUpdateOptions } from './hub-update.js';
import { Identity } from './identity.js';
import { Backups, type BackupOptions } from './backups.js';

export const credentialsSchema = z.array(z.strictObject({
  id: z.string().min(1).max(64),
  role: z.enum(['admin', 'publisher', 'reader']),
  products: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)).max(100),
  token: z.string().regex(/^[a-f0-9]{64}$/),
})).min(1).max(100).superRefine((credentials, context) => {
  if (new Set(credentials.map((entry) => entry.id)).size !== credentials.length
    || new Set(credentials.map((entry) => entry.token)).size !== credentials.length) {
    context.addIssue({ code: 'custom', message: 'Credential IDs and tokens must be unique' });
  }
});
export type Credentials = z.infer<typeof credentialsSchema>;
type Options = { directory: string; credentials: Credentials; webRoot?: string; uploadLimit?: number; uploadTimeoutMs?: number; applicationVersion?: string; hubUpdate?: HubUpdateOptions; backups?: BackupOptions };
const idParams = z.object({ id: z.uuid() });
const api = '/api/v1';

export async function buildApp(options: Options) {
  const app = Fastify({ logger: false, bodyLimit: 256 * 1024, requestTimeout: 0, connectionTimeout: 10000, exposeHeadRoutes: false });
  const store = new Store(options.directory);
  const identity = new Identity(store);
  const updates = options.hubUpdate ? new HubUpdates(options.hubUpdate, store) : null;
  const backups = options.backups ? new Backups(options.backups, store) : null;
  app.addHook('onRequest', async (request, reply) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && ![`${api}/updates/check`, `${api}/admin/hub-update/check`, `${api}/admin/hub-update/install`].includes(request.url)
      && (updates?.maintenance() || backups?.maintenance())) return reply.code(503).header('Retry-After', '10').send({ error: { code: 'maintenance', message: 'Hub maintenance is active' } });
  });
  const credentials = credentialsSchema.parse(options.credentials).map(({ token, ...principal }) => ({
    principal, hash: createHash('sha256').update(token).digest(),
  }));
  await app.register(helmet, { contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"], imgSrc: ["'self'", 'data:'],
    connectSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"], upgradeInsecureRequests: null,
  } } });
  await app.register(rateLimit, { max: 600, timeWindow: '1 minute' });
  await app.register(multipart, { throwFileSizeLimit: false, limits: { fileSize: Number.MAX_SAFE_INTEGER, files: 1, fields: 0, parts: 1 } });
  app.addHook('onClose', async () => store.close());
  app.addHook('onSend', async (request, reply) => {
    if (request.url.startsWith(api)) reply.header('Cache-Control', 'no-store');
  });
  function authenticate(request: FastifyRequest): Principal {
    const authorization = request.headers.authorization ?? '';
    if (!authorization) return identity.cookie(request);
    demand(/^Bearer [a-f0-9]{64}$/.test(authorization), 401, 'unauthorized', 'A valid bearer credential is required');
    const hash = createHash('sha256').update(authorization.slice(7)).digest();
    const match = credentials.find((entry) => timingSafeEqual(entry.hash, hash));
    const principal = match?.principal ?? identity.bearer(authorization.slice(7));
    demand(principal, 401, 'unauthorized', 'A valid bearer credential is required');
    return principal;
  }
  function writer(request: FastifyRequest): Principal {
    const principal = authenticate(request);
    demand(principal.role !== 'reader', 403, 'forbidden', 'Publishing permission is required');
    return principal;
  }
  function administrator(request: FastifyRequest): Principal {
    const principal = authenticate(request);
    demand(principal.role === 'admin', 403, 'forbidden', 'Administrator permission is required');
    return principal;
  }
  function releaseId(request: FastifyRequest): string { return idParams.parse(request.params).id; }
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof HubError) return reply.code(error.status).send({ error: { code: error.code, message: error.message } });
    if (error instanceof ZodError) return reply.code(400).send({ error: { code: 'invalid_input', message: error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`).join('; ') } });
    const known = error as { statusCode?: number; code?: string };
    const status = known.statusCode && known.statusCode >= 400 && known.statusCode < 500 ? known.statusCode : 500;
    return reply.code(status).send({ error: { code: status === 500 ? 'internal_error' : 'invalid_request', message: status === 500 ? 'The operation could not be completed' : 'Request rejected' } });
  });
  identity.register(app, authenticate, administrator);
  app.get('/health', async () => ({ status: 'ok', version: options.applicationVersion ?? '0.1.0', database_schema: 3, maintenance: Boolean(updates?.maintenance() || backups?.maintenance()) }));
  app.get(`${api}/session`, async (request) => authenticate(request));
  app.get(`${api}/admin/settings`, async (request) => { administrator(request); return store.settings(); });
  app.put(`${api}/admin/settings`, async (request) => store.setSettings(adminSettingsSchema.parse(request.body), administrator(request)));
  app.get(`${api}/publishing/limits`, async (request) => { writer(request); return store.settings(); });
  app.get(`${api}/admin/backups`, async (request) => {
    administrator(request); return { available: backups !== null, agent_ready: backups?.ready() ?? false, settings: backups?.settings() ?? null, job: backups?.job() ?? null };
  });
  app.put(`${api}/admin/backups`, async (request) => {
    const principal = administrator(request); demand(backups, 503, 'backups_unavailable', 'Protected host backup configuration is required');
    return backups.save(request.body, principal);
  });
  for (const kind of ['test', 'backup'] as const) app.post(`${api}/admin/backups/${kind}`, async (request, reply) => {
    const principal = administrator(request); demand(backups, 503, 'backups_unavailable', 'Protected host backup configuration is required');
    return reply.code(202).send(backups.enqueue(kind, principal));
  });
  app.get(`${api}/admin/hub-update`, async (request) => {
    administrator(request);
    return { enabled: updates !== null, agent_ready: updates?.agentReady() ?? false, current_version: options.applicationVersion ?? '0.1.0', target: updates?.options.target ?? null, job: updates?.job() ?? null };
  });
  app.post(`${api}/admin/hub-update/check`, async (request) => {
    const principal = administrator(request);
    demand(updates, 503, 'updater_disabled', 'Host updater is not configured');
    return { release: updates.check(principal) };
  });
  app.post(`${api}/admin/hub-update/install`, async (request, reply) => {
    const principal = administrator(request);
    demand(!backups?.maintenance() && backups?.job()?.state !== 'running', 409, 'backup_busy', 'Wait for the active backup operation');
    demand(updates, 503, 'updater_disabled', 'Host updater is not configured');
    const input = z.strictObject({ release_id: z.uuid(), confirmation: z.string().max(96) }).parse(request.body);
    return reply.code(202).send(await updates.enqueue(input.release_id, input.confirmation, principal));
  });
  app.get(`${api}/admin/products`, async (request) => store.products(authenticate(request)));
  app.post(`${api}/admin/products`, async (request, reply) => {
    const principal = administrator(request);
    const product = productSchema.parse(request.body);
    store.createProduct(product, principal);
    return reply.code(201).send(product);
  });
  app.get(`${api}/admin/audit-events`, async (request) => { administrator(request); return store.events(); });
  app.get(`${api}/publishing/releases`, async (request) => store.list(writer(request)));
  app.post(`${api}/publishing/releases`, async (request, reply) => {
    const principal = writer(request);
    const key = z.string().min(8).max(128).regex(/^[a-zA-Z0-9_-]+$/).parse(request.headers['idempotency-key']);
    return reply.code(201).send(store.create(draftSchema.parse(request.body), key, principal));
  });
  app.get(`${api}/publishing/releases/:id`, async (request) => store.get(releaseId(request), writer(request)));
  app.patch(`${api}/publishing/releases/:id`, async (request) => store.edit(releaseId(request), draftSchema.parse(request.body), writer(request)));
  app.post(`${api}/publishing/releases/:id/artifacts`, async (request) => {
    const principal = writer(request);
    const id = releaseId(request);
    demand(store.get(id, principal).status === 'draft', 409, 'immutable_release', 'Only drafts accept uploads');
    const settings = store.settings();
    const limit = options.uploadLimit ?? settings.upload_max_bytes ?? Number.MAX_SAFE_INTEGER;
    const temporary = join(store.staging, randomUUID());
    let artifact: Artifact | undefined;
    try {
      for await (const part of request.parts({ limits: { fileSize: limit } })) {
        demand(part.type === 'file', 400, 'invalid_upload', 'Upload one file using the file field');
        const parsedName = fileNameSchema.safeParse(part.filename);
        if (part.fieldname !== 'file' || !parsedName.success) {
          part.file.resume();
          if (!parsedName.success) throw parsedName.error;
          throw new HubError(400, 'invalid_upload', 'Upload one file using the file field');
        }
        const filename = parsedName.data;
        let size = 0;
        const hash = createHash('sha256');
        const count = new Transform({ transform(chunk: Buffer, _encoding, callback) {
          size += chunk.length;
          if (size > limit) return callback(new HubError(413, 'file_too_large', 'Upload exceeds the file limit'));
          hash.update(chunk);
          callback(null, chunk);
        } });
        const signal = AbortSignal.timeout(options.uploadTimeoutMs ?? settings.upload_timeout_seconds * 1000);
        const output = createWriteStream(temporary, { flags: 'wx', mode: 0o600 });
        let cancel = () => {};
        const deadline = new Promise<never>((_resolve, reject) => {
          cancel = () => reject(new HubError(408, 'upload_timeout', 'Upload did not complete within the allowed time'));
          signal.addEventListener('abort', cancel, { once: true });
        });
        try {
          await Promise.race([pipeline(part.file, count, output, { signal }), deadline]);
        } finally {
          signal.removeEventListener('abort', cancel);
          output.destroy();
          await finished(output).catch(() => {});
        }
        demand(!part.file.truncated && size <= limit, 413, 'file_too_large', 'Upload exceeds the file limit');
        demand(size > 0, 400, 'empty_file', 'Empty artifacts are not allowed');
        artifact = { id: randomUUID(), filename, size, sha256: hash.digest('hex') };
      }
      demand(artifact, 400, 'missing_file', 'Upload one artifact');
      const descriptor = openSync(temporary, 'r+');
      try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
      const destination = store.artifactPath(artifact);
      if (existsSync(destination)) {
        const existing = digestFile(destination);
        demand(existing.sha256 === artifact.sha256 && existing.size === artifact.size, 422, 'integrity_error', 'Stored content failed integrity verification');
      } else { renameSync(temporary, destination); syncDirectory(store.blobs); }
      return store.attach(id, artifact, principal);
    } finally { rmSync(temporary, { force: true }); }
  });
  app.delete(`${api}/publishing/releases/:id/artifacts/:artifactId`, async (request) => {
    const params = z.object({ id: z.uuid(), artifactId: z.uuid() }).parse(request.params);
    return store.detach(params.id, params.artifactId, writer(request));
  });
  app.put(`${api}/publishing/releases/:id/manifest`, async (request) => store.setManifest(releaseId(request), manifestInputSchema.parse(request.body), writer(request)));
  app.post(`${api}/publishing/releases/:id/validate`, async (request) => {
    const errors = store.validate(store.get(releaseId(request), writer(request)));
    return { valid: errors.length === 0, errors };
  });
  app.post(`${api}/publishing/releases/:id/publish`, async (request) => store.publish(releaseId(request), writer(request)));
  app.post(`${api}/admin/releases/:id/withdraw`, async (request) => store.withdraw(releaseId(request), administrator(request)));
  app.post(`${api}/updates/check`, async (request) => {
    const principal = authenticate(request);
    const check = checkSchema.parse(request.body);
    demand(permits(principal, check.product), 403, 'forbidden', 'Product access denied');
    const release = selectRelease(store.list(principal), check, principal);
    if (!release) return { update_available: false, reason: 'no_eligible_update' };
    return { update_available: true, release: { id: release.id, product: release.product, version: release.version,
      channel: release.channel, release_notes: release.release_notes, manifest_url: `${api}/releases/${release.id}/manifest` } };
  });
  app.get(`${api}/releases/:id/manifest`, async (request) => {
    const release = store.get(releaseId(request), authenticate(request));
    demand(release.status === 'published' && release.manifest, 404, 'not_found', 'Published manifest not found');
    return { schema_version: '1', release_id: release.id, product: release.product, version: release.version,
      channel: release.channel, targets: release.targets, published_at: release.published_at,
      artifacts: release.manifest.artifact_order.map((id) => {
        const artifact = release.artifacts.find((entry) => entry.id === id)!;
        return { ...artifact, required: true, download_url: `${api}/artifacts/${artifact.id}/download` };
      }) };
  });
  app.route({ method: ['GET', 'HEAD'], url: `${api}/artifacts/:id/download`, handler: async (request, reply) => {
    const principal = authenticate(request);
    const id = releaseId(request);
    const release = store.list(principal).find((entry) => entry.status === 'published' && entry.artifacts.some((artifact) => artifact.id === id));
    demand(release, 404, 'not_found', 'Published artifact not found');
    const artifact = release.artifacts.find((entry) => entry.id === id)!;
    demand(store.verify(artifact), 422, 'integrity_error', 'Artifact integrity verification failed');
    const etag = `"sha256-${artifact.sha256}"`;
    reply.header('ETag', etag).header('Accept-Ranges', 'bytes').header('Content-Type', 'application/octet-stream')
      .header('Content-Disposition', `attachment; filename="${artifact.filename}"`);
    let start = 0;
    let end = artifact.size - 1;
    const range = request.headers.range;
    if (range && (!request.headers['if-range'] || request.headers['if-range'] === etag)) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2])) return reply.code(416).header('Content-Range', `bytes */${artifact.size}`).send();
      if (!match[1]) start = Math.max(0, artifact.size - Number(match[2]));
      else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= artifact.size) {
        return reply.code(416).header('Content-Range', `bytes */${artifact.size}`).send();
      }
      reply.code(206).header('Content-Range', `bytes ${start}-${end}/${artifact.size}`);
    }
    reply.header('Content-Length', end - start + 1);
    if (request.method === 'HEAD') return reply.send();
    return reply.send(createReadStream(store.artifactPath(artifact), { start, end }));
  } });
  const webRoot = resolve(options.webRoot ?? 'dist');
  if (existsSync(join(webRoot, 'index.html'))) {
    await app.register(fastifyStatic, { root: webRoot, index: 'index.html' });
  }
  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: { code: 'not_found', message: 'Resource not found' } }));
  await app.ready();
  return { app, store };
}