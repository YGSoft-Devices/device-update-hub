<!-- File: /docs/DECISIONS.md | Version: 0.3.0 | Updated: 2026-10-16 -->
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
- `POST /api/v1/publishing/releases/{id}/artifacts`: one multipart `file` per upload under the persistent admin size/deadline policy (no size cap by default), 32 artifacts/release. Portable unique filename; same filename/hash replay is idempotent; different bytes conflict. No archive extraction. Hash and size are computed by the server. Delete draft files through `DELETE .../artifacts/{artifact_id}`; detached content stays until controlled garbage collection exists.
- `PUT .../{id}/manifest`: `{schema_version:"1",artifact_order:[UUID,...]}`. Every uploaded file must appear exactly once. All artifacts are required; array order is declarative, never a shell command. Display names and download URLs are server-generated.
- `POST .../{id}/validate`: verifies schema, complete inventory, bytes, sizes and checksums; returns `{valid,errors}`.
- `POST .../{id}/publish`: revalidates bytes and freezes metadata/inventory atomically with audit record. Safe to replay. No incomplete release is visible.
- `POST /api/v1/admin/releases/{id}/withdraw`: terminal withdrawal, safe to replay, audit retained; immediately blocks new checks and downloads. Already-open streams may finish. Republish and destructive cleanup are deliberately absent.

`GET /api/v1/releases/{id}/manifest` returns the immutable identity, targets, artifact inventory and download references of a published authorized release. `GET/HEAD /api/v1/artifacts/{id}/download` supports single HTTP ranges, content length, SHA-256 ETag and attachment disposition. No external URLs, installation commands, telemetry or device identifiers in this MVP.

## Durability and Recovery

Bytes are staged, synced and atomically renamed before metadata references them. Files are never modified after storage. SQLite transactions couple lifecycle changes with audit records. Interrupted writes may leave unreferenced files, but never discoverable partial releases. Backup/restore requires stopping the single writer and copying the entire data directory, including database sidecars, plus a separately secured credentials backup. Physical disk corruption is outside transaction guarantees: validate before publication and on download; keep off-host backups. Signing, migrations, storage quotas beyond per-upload limits and automated garbage collection remain production gates.

## Developer Experience and Planned Origin

The user's 2026-10-16 follow-up requests a separate backfilled changelog, per-file version enforcement, dark appearance, developer integration documentation/scripts and preparation for `https://updatehub.ygsoft.fr`. The domain is not created, and this does not expand local authorization to production deployment. Relative API URLs already support a future same-origin HTTPS proxy. Developer clients allow loopback or this exact HTTPS origin and refuse redirects/unexpected origins; no domain availability test or live-device operation is part of local verification.

The reference Node client and CLI separate checks, manifest retrieval and verified downloads. Downloads validate expected compatibility, SHA-256 and size, use private temporary files and refuse to overwrite different existing files. They do not install. Node and PowerShell HTTP publishers implement the same principal-scoped retry semantics. Scoped tokens may be supplied by a protected raw token file or process environment rather than distributing the complete local credential array. Production provisioning, signing and identity remain unresolved gates, not silently approved decisions.

System/Light/Dark is a presentation preference; only that preference may persist in localStorage. Authentication remains memory-only. Source file versions and SHA-256 snapshots are checked by tests/builds; application, protocol and database versions do not change merely because a document or tool changes.

## Approved Self-update and Upload Settings

The concrete Hub-only package contract and installation/recovery procedure are in [SELF_UPDATE.md](SELF_UPDATE.md). Ed25519 signs exact bounded JSON with image SHA-256/size/immutable ID, version/channel, exact target and database schema 2. The agent's public key and fixed Compose policy are pinned outside the web application's write access. Data-only packages, private re-verification, host heartbeat, process lock, offline backup, exact-version health and durable recovery states are mandatory. Generic device signing/installation and public production activation remain separate gates.

The user approved Linux + Docker Compose self-updates through an external systemd host agent, signed packages, explicit admin approval, atomic directory handoff, maintenance, consistent backup and verified restart. This authorizes implementation and isolated local tests, not executing a privileged update on this Windows development machine or enabling public production access. Trusted host configuration, signing verification keys and Docker control stay outside the web application's write access. Packages contain data/image bytes, never executable installation instructions. A failed update must remain recoverable without the Hub itself.

This supersedes the original 64 MiB upload limit: upload size is a persistent admin-only setting, `upload_max_bytes` (positive safe integer or null for no application cap), with `upload_timeout_seconds` (1-86400, default 3600). Changes are audited and affect subsequent requests without restart. Multipart processing stays streamed. Reverse-proxy limits and storage capacity are independent operator responsibilities. Database schema 2 adds settings through an atomic additive migration from schema 1; existing releases/audit remain intact. Back up before deploying this schema change. Old binaries are not supported against schema 2 databases.

## Approved Accounts and Synology Backups

On 2026-10-16 the user approved local username/password accounts alongside distinct script/API tokens, SMB 3 Synology storage, Restic encryption, configurable scheduling/retention and a short maintenance window for consistent backups. The exact HTTPS deployment is already active under the later authorization recorded in AGENTS.md and DEPLOYMENT.md; earlier local-only statements above describe their original approval stage.

Accounts have admin/publisher/reader roles and explicit product grants. Passwords use Argon2id; browser sessions use random, hashed-at-rest credentials in HttpOnly, Secure, SameSite cookies on HTTPS, explicit expiry/revocation and same-origin CSRF enforcement. Plain HTTP cookies are permitted only for isolated loopback development. Login errors do not enumerate users. Password reset/change, disabling an account and permission changes revoke its sessions. Administrators create/edit/disable/reset accounts and manage distinct revocable API tokens. The last enabled administrator cannot be disabled or demoted. Existing file-backed tokens remain available for compatibility and initial administrator bootstrap; they are not converted into user passwords or displayed by account APIs. Email recovery, external SSO and MFA are not part of this approved first delivery.

User/session/token tables require an atomic additive catalog schema 2 -> 3 migration, with a stopped complete-data backup before deployment. Old binaries must reject schema 3. Host-agent/package schema support must be updated explicitly before installing a schema-3 package; failed installation restores the schema-2 offline backup before restarting the previous image. Published 0.1.1 and the reserved 0.1.2 fixture remain immutable. This change requires a new signed application version.

Backup administration configures a private IPv4 Synology destination, SMB share/subdirectory, dedicated account, repository recovery password, enabled state, UTC daily time and retention (initial proposal: 7 daily, 4 weekly, 6 monthly). Secrets are write-only through HTTPS, encrypted at rest under an independently protected deployment key, omitted from responses/audit/errors and never stored in browser storage. A recovery password must be retained separately outside the VM. Missing configuration leaves backups disabled; no NAS connection is authorized until its destination is supplied by the operator.

The external host agent, never the web container, runs fixed Restic/rclone commands over SMB 3 without mounting a filesystem. It serializes backups with self-updates, publishes maintenance/status, stops the single writer only while making a consistent private local data/configuration copy, restarts the pinned current image, then transfers encrypted snapshots. Repository passwords and temporary SMB credentials are protected private files or child-process input, not command-line values or logs. Upload failure retains a useful local recovery copy and records a sanitized failure. Retention runs only after a successful snapshot. The signing private key is workstation-only and requires a separate protected backup; the Hub cannot back it up.

The UI provides save, connection test, explicit backup, scheduling/retention and recent results. Restore is a documented, explicit operator procedure on a stopped target, not a web-triggered arbitrary server replacement. Isolated tests use fake host/network adapters; no live NAS operation occurs without operator configuration. Installation includes separately maintained Restic/rclone host prerequisites. Production identity hardening, backup-destination certification and an independent restore test remain gates until verified.