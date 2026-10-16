// File: /src/identity.ts | Version: 0.1.2
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Algorithm, hash, verify } from '@node-rs/argon2';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Principal } from './contract.js';
import { demand, HubError, Store } from './store.js';

const password = z.string().min(15).max(256);
const username = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._-]{2,63}$/);
export const userInput = z.strictObject({ username, name: z.string().trim().min(1).max(100), role: z.enum(['admin', 'publisher', 'reader']),
  products: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)).max(100), enabled: z.boolean() });
export type User = z.infer<typeof userInput> & { id: string; created_at: string; updated_at: string };
type UserRow = Omit<User, 'products' | 'enabled'> & { products: string; enabled: number; password_hash: string };
const hashOptions = { algorithm: Algorithm.Argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1, outputLen: 32 };
const dummy = hash(randomBytes(32).toString('hex'), hashOptions);
let passwordOperations = 0;
async function passwordWork<Value>(operation: () => Promise<Value>): Promise<Value> {
  demand(passwordOperations < 2, 429, 'password_busy', 'Password verification is busy; retry shortly');
  passwordOperations += 1;
  try { return await operation(); } finally { passwordOperations -= 1; }
}
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
function publicUser(row: UserRow): User {
  return { id: row.id, username: row.username, name: row.name, role: row.role, products: JSON.parse(row.products) as string[],
    enabled: row.enabled === 1, created_at: row.created_at, updated_at: row.updated_at };
}
function principal(row: UserRow): Principal { return { id: row.id, role: row.role, products: JSON.parse(row.products) as string[] }; }
function sameOrigin(request: FastifyRequest): URL {
  let origin: URL | undefined;
  try { origin = new URL(request.headers.origin ?? ''); } catch {}
  demand(origin && origin.origin === request.headers.origin && origin.host === request.headers.host
    && (origin.protocol === 'https:' || (origin.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(origin.hostname))),
  403, 'invalid_origin', 'A same-origin HTTPS request is required');
  return origin;
}
export class Identity {
  constructor(readonly store: Store) {}
  users(): User[] { return (this.store.db.prepare('SELECT * FROM users ORDER BY username').all() as UserRow[]).map(publicUser); }
  private row(id: string): UserRow {
    const row = this.store.db.prepare('SELECT * FROM users WHERE id=?').get(id) as UserRow | undefined;
    demand(row, 404, 'user_not_found', 'User not found'); return row;
  }
  private validate(input: z.infer<typeof userInput>, id?: string) {
    demand(!this.store.db.prepare('SELECT id FROM users WHERE username=? AND id<>?').get(input.username, id ?? ''), 409, 'username_exists', 'Username is already in use');
    for (const product of input.products) demand(this.store.db.prepare('SELECT id FROM products WHERE id=?').get(product), 400, 'product_not_found', 'Unknown product grant');
    demand(input.role !== 'admin' || input.products.length === 0, 400, 'invalid_grants', 'Administrators must not have product-specific grants');
  }
  async create(input: z.infer<typeof userInput> & { password: string }, actor: Principal): Promise<User> {
    const parsed = userInput.parse({ username: input.username, name: input.name, role: input.role, products: input.products, enabled: input.enabled });
    const value = password.parse(input.password);
    const encoded = await passwordWork(() => hash(value, hashOptions));
    return this.store.transaction(() => {
      this.validate(parsed);
      const id = randomUUID(); const at = new Date().toISOString();
      this.store.db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?,?,?)').run(id, parsed.username, parsed.name, parsed.role, JSON.stringify(parsed.products), encoded, Number(parsed.enabled), at, at);
      this.store.audit(actor, 'user.created', id); return publicUser(this.row(id));
    });
  }
  update(id: string, input: z.infer<typeof userInput>, actor: Principal): User {
    const parsed = userInput.parse(input);
    return this.store.transaction(() => {
      const previous = this.row(id); this.validate(parsed, id);
      if (previous.enabled && previous.role === 'admin' && (!parsed.enabled || parsed.role !== 'admin')) {
        const count = this.store.db.prepare("SELECT count(*) AS count FROM users WHERE role='admin' AND enabled=1").get() as { count: number };
        demand(count.count > 1, 409, 'last_administrator', 'The last enabled administrator cannot be disabled or demoted');
      }
      this.store.db.prepare('UPDATE users SET username=?,name=?,role=?,products=?,enabled=?,updated_at=? WHERE id=?')
        .run(parsed.username, parsed.name, parsed.role, JSON.stringify(parsed.products), Number(parsed.enabled), new Date().toISOString(), id);
      this.revokeSessions(id);
      if (previous.role !== parsed.role || previous.enabled !== Number(parsed.enabled) || previous.username !== parsed.username || previous.products !== JSON.stringify(parsed.products)) {
        this.store.db.prepare('DELETE FROM api_tokens WHERE user_id=?').run(id);
      }
      this.store.audit(actor, 'user.updated', id); return publicUser(this.row(id));
    });
  }
  revokeSessions(id: string): void { this.store.db.prepare('DELETE FROM sessions WHERE user_id=?').run(id); }
  async reset(id: string, value: string, actor: Principal) {
    const parsed = password.parse(value);
    const encoded = await passwordWork(() => hash(parsed, hashOptions));
    this.store.transaction(() => {
      this.row(id); this.store.db.prepare('UPDATE users SET password_hash=?,updated_at=? WHERE id=?').run(encoded, new Date().toISOString(), id);
      this.revokeSessions(id); this.store.db.prepare('DELETE FROM api_tokens WHERE user_id=?').run(id);
      this.store.audit(actor, 'user.password_reset', id);
    });
  }
  async login(name: string, value: string): Promise<string> {
    const row = this.store.db.prepare('SELECT * FROM users WHERE username=?').get(name.toLowerCase()) as UserRow | undefined;
    const encoded = row?.password_hash ?? await dummy;
    const valid = await passwordWork(() => verify(encoded, value));
    demand(valid && row?.enabled, 401, 'invalid_credentials', 'Invalid username or password');
    const current = this.row(row.id);
    demand(current.enabled && current.password_hash === row.password_hash, 401, 'invalid_credentials', 'Invalid username or password');
    const token = randomBytes(32).toString('hex'); const now = Date.now();
    this.store.transaction(() => {
      this.store.db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now);
      this.store.db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(digest(token), row.id, now, now + 8 * 3600000);
      this.store.db.prepare('DELETE FROM sessions WHERE user_id=? AND hash NOT IN (SELECT hash FROM sessions WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT 16)').run(row.id, row.id);
      this.store.audit(principal(current), 'session.created', row.id);
    });
    return token;
  }
  bearer(value: string): Principal | null {
    const row = this.store.db.prepare('SELECT users.* FROM api_tokens JOIN users ON users.id=api_tokens.user_id WHERE api_tokens.hash=? AND api_tokens.expires_at>? AND users.enabled=1')
      .get(digest(value), Date.now()) as UserRow | undefined;
    return row ? principal(row) : null;
  }
  cookie(request: FastifyRequest): Principal {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) sameOrigin(request);
    const values = (request.headers.cookie ?? '').split(';').map((entry) => entry.trim());
    const secure = values.find((entry) => entry.startsWith('__Host-duh_session='));
    const value = secure?.slice('__Host-duh_session='.length) ?? values.find((entry) => entry.startsWith('duh_session='))?.slice('duh_session='.length) ?? '';
    demand(/^[a-f0-9]{64}$/.test(value), 401, 'unauthorized', 'Sign in is required');
    const row = this.store.db.prepare('SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.hash=? AND sessions.expires_at>? AND users.enabled=1')
      .get(digest(value), Date.now()) as UserRow | undefined;
    demand(row, 401, 'unauthorized', 'Session expired or revoked'); return principal(row);
  }
  register(app: FastifyInstance, authenticate: (request: FastifyRequest) => Principal, admin: (request: FastifyRequest) => Principal) {
    app.get('/api/v1/auth/session', async (request) => {
      try { return { principal: authenticate(request) }; } catch (error) { if (error instanceof HubError && error.status === 401) return { principal: null }; throw error; }
    });
    app.post('/api/v1/auth/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
      const origin = sameOrigin(request);
      const input = z.strictObject({ username, password: z.string().min(1).max(256) }).parse(request.body);
      const token = await this.login(input.username, input.password);
      const secure = origin.protocol === 'https:';
      reply.header('Set-Cookie', `${secure ? '__Host-duh_session' : 'duh_session'}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${secure ? '; Secure' : ''}`);
      return { authenticated: true };
    });
    app.post('/api/v1/auth/logout', async (request, reply) => {
      sameOrigin(request);
      const values = (request.headers.cookie ?? '').split(';').map((value) => value.trim());
      for (const entry of values) {
        const match = /^(?:__Host-duh_session|duh_session)=([a-f0-9]{64})$/.exec(entry);
        if (match) this.store.db.prepare('DELETE FROM sessions WHERE hash=?').run(digest(match[1]!));
      }
      reply.header('Set-Cookie', ['__Host-duh_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0', 'duh_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0']);
      return { signed_out: true };
    });
    app.get('/api/v1/admin/users', async (request) => { admin(request); return this.users(); });
    app.post('/api/v1/admin/users', async (request, reply) => {
      const actor = admin(request); const input = userInput.extend({ password }).parse(request.body);
      return reply.code(201).send(await this.create(input, actor));
    });
    app.put('/api/v1/admin/users/:id', async (request) => {
      const actor = admin(request); const id = z.object({ id: z.uuid() }).parse(request.params).id;
      return this.update(id, userInput.parse(request.body), actor);
    });
    app.put('/api/v1/admin/users/:id/password', async (request) => {
      const actor = admin(request); const id = z.object({ id: z.uuid() }).parse(request.params).id;
      await this.reset(id, z.strictObject({ password }).parse(request.body).password, actor); return { changed: true };
    });
    app.delete('/api/v1/admin/users/:id/sessions', async (request) => {
      const actor = admin(request); const id = z.object({ id: z.uuid() }).parse(request.params).id;
      this.store.transaction(() => { this.row(id); this.revokeSessions(id); this.store.audit(actor, 'sessions.revoked', id); }); return { revoked: true };
    });
    app.put('/api/v1/account/password', async (request) => {
      const actor = authenticate(request); const input = z.strictObject({ current_password: z.string().min(1).max(256), password }).parse(request.body);
      const encoded = this.row(actor.id).password_hash;
      demand(await passwordWork(() => verify(encoded, input.current_password)), 401, 'invalid_credentials', 'Invalid current password');
      await this.reset(actor.id, input.password, actor); return { changed: true };
    });
    app.get('/api/v1/admin/users/:id/tokens', async (request) => {
      admin(request); const id = z.object({ id: z.uuid() }).parse(request.params).id; this.row(id);
      return this.store.db.prepare('SELECT id,name,created_at,expires_at FROM api_tokens WHERE user_id=? ORDER BY created_at DESC').all(id);
    });
    app.post('/api/v1/admin/users/:id/tokens', async (request, reply) => {
      const actor = admin(request); const id = z.object({ id: z.uuid() }).parse(request.params).id;
      const input = z.strictObject({ name: z.string().trim().min(1).max(100), days: z.number().int().min(1).max(365) }).parse(request.body);
      const token = randomBytes(32).toString('hex'); const tokenId = randomUUID(); const expires = Date.now() + input.days * 86400000;
      this.store.transaction(() => {
        demand(this.row(id).enabled, 409, 'disabled_user', 'Enable the user before issuing a token');
        const count = this.store.db.prepare('SELECT count(*) AS count FROM api_tokens WHERE user_id=?').get(id) as { count: number };
        demand(count.count < 20, 409, 'token_limit', 'Revoke an existing token before issuing another');
        this.store.db.prepare('INSERT INTO api_tokens VALUES(?,?,?,?,?,?)').run(tokenId, id, input.name, digest(token), new Date().toISOString(), expires);
        this.store.audit(actor, 'token.created', tokenId);
      });
      return reply.code(201).send({ id: tokenId, name: input.name, token, expires_at: expires });
    });
    app.delete('/api/v1/admin/users/:id/tokens/:tokenId', async (request) => {
      const actor = admin(request); const input = z.object({ id: z.uuid(), tokenId: z.uuid() }).parse(request.params);
      this.store.transaction(() => {
        demand(this.store.db.prepare('DELETE FROM api_tokens WHERE id=? AND user_id=?').run(input.tokenId, input.id).changes, 404, 'not_found', 'Token not found');
        this.store.audit(actor, 'token.revoked', input.tokenId);
      }); return { revoked: true };
    });
  }
}