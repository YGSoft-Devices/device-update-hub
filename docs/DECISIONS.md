<!-- File: /docs/DECISIONS.md | Version: 0.1.0 | Updated: 2026-10-16 -->
# Approved MVP Contract

Approved by the user on 2026-10-16 after explicit review of stack, security, persistence and interoperability choices. Implementation is authorized for local development and local deployment only. No live devices or production services.

## Architecture

Node.js 24+, TypeScript, Fastify, React/Vite. Single process and single writable SQLite database, WAL and full synchronous commits; immutable content-addressed artifact files in the same persistent data directory. No multi-replica deployment or network filesystem. Docker Compose binds to loopback. Production needs independently reviewed TLS, credential lifecycle and manifest signing. SHA-256 is integrity, not publisher authenticity.

## Identity

Private API: no anonymous checks or downloads. Random bearer credentials have separate admin, publisher and reader roles. Non-admin credentials have explicit product allowlists, never wildcard grants. Only admins manage products and withdraw releases. Publishers create, upload, validate and publish within their product grants. Readers check and retrieve published manifests/artifacts only. Drafts and withdrawn files are inaccessible to readers. Keys are provisioned in a protected local secret file, hashed in application memory, never logged, never stored in the browser. Rotation requires a secret-file update and restart. This is a local MVP, not a multi-user identity service.

## Protocol v1

`src/contract.ts` defines strict runtime schemas. Unknown properties are rejected. API errors have `{ "error": { "code": "...", "message": "..." } }` and appropriate HTTP status. UUIDs identify releases and artifacts. Slugs identify products/channels/platform attributes. Canonical SemVer only, no build metadata. Custom version formats are deferred.

Check: `POST /api/v1/updates/check` with `product`, `current_version`, `channel`, `target`. A target has required exact `device_type`, `os`, `architecture`, `hardware_revision`, and integer `updater_protocol: 1`. No wildcards or inferred compatibility. Response is `{update_available:false, reason:"no_eligible_update"}` or `{update_available:true, release:{id,product,version,channel,release_notes,manifest_url}}`. Missing permission is 403, not a misleading no-update response. Check has no download, install or database mutation side effect.

Stable excludes prereleases; other channels allow them without crossing tracks. Filter status, permissions and targets before SemVer ordering. No downgrades. Unique `(product, channel, version)` prevents ambiguous candidates, including withdrawn releases; corrections require a new version.

## Publishing

`GET/POST /api/v1/admin/products`; `GET /api/v1/admin/audit-events` (latest 100). Shared web/script publisher endpoints:

- `GET/POST /api/v1/publishing/releases`: list/create. Create requires `Idempotency-Key` (8-128 portable characters), scoped to principal. Identical normalized request replays return the same release, including after publication; changed content returns 409.
- `GET/PATCH /api/v1/publishing/releases/{id}`: inspect/edit a draft. PATCH replaces all draft metadata with the strict draft schema and invalidates its manifest; product cannot change.
- `POST /api/v1/publishing/releases/{id}/artifacts`: one multipart `file` per upload, maximum 64 MiB, 32 artifacts/release. Portable unique filename; same filename/hash replay is idempotent; different bytes conflict. No archive extraction. Hash and size are computed by the server. Delete draft files through `DELETE .../artifacts/{artifact_id}`; detached content stays until controlled garbage collection exists.
- `PUT .../{id}/manifest`: `{schema_version:"1",artifact_order:[UUID,...]}`. Every uploaded file must appear exactly once. All artifacts are required; array order is declarative, never a shell command. Display names and download URLs are server-generated.
- `POST .../{id}/validate`: verifies schema, complete inventory, bytes, sizes and checksums; returns `{valid,errors}`.
- `POST .../{id}/publish`: revalidates bytes and freezes metadata/inventory atomically with audit record. Safe to replay. No incomplete release is visible.
- `POST /api/v1/admin/releases/{id}/withdraw`: terminal withdrawal, safe to replay, audit retained; immediately blocks new checks and downloads. Already-open streams may finish. Republish and destructive cleanup are deliberately absent.

`GET /api/v1/releases/{id}/manifest` returns the immutable identity, targets, artifact inventory and download references of a published authorized release. `GET/HEAD /api/v1/artifacts/{id}/download` supports single HTTP ranges, content length, SHA-256 ETag and attachment disposition. No external URLs, installation commands, telemetry or device identifiers in this MVP.

## Durability and Recovery

Bytes are staged, synced and atomically renamed before metadata references them. Files are never modified after storage. SQLite transactions couple lifecycle changes with audit records. Interrupted writes may leave unreferenced files, but never discoverable partial releases. Backup/restore requires stopping the single writer and copying the entire data directory, including database sidecars, plus a separately secured credentials backup. Physical disk corruption is outside transaction guarantees: validate before publication and on download; keep off-host backups. Signing, migrations, storage quotas beyond per-upload limits and automated garbage collection remain production gates.