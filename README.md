<!-- File: /README.md | Document version: 0.3.1 | Status: LOCAL MVP | Updated: 2026-10-16 -->
# Device Update Hub

> **Working name:** Device Update Hub (DUH)  
> **Status:** Local MVP implemented and tested; production not authorized  
> **Document version:** `0.3.1`  
> **Specification version:** `0.1.0`  
> **Repository location:** `/README.md`  
> **Last updated:** 2026-10-16  
> **Potential future relationship:** Meeting integration, not yet designed or committed

## Local MVP / MVP local

**FR** — Le serveur, l'administration web, les thèmes System/Light/Dark et les outils développeurs sont implémentés. Le [guide développeur](docs/DEVELOPERS.md) couvre API HTTP, CLI, interface web, vérification et téléchargement explicite. L'historique est dans [CHANGELOG.md](CHANGELOG.md) et chaque fichier source possède une version contrôlée. Le domaine prévu est **https://updatehub.ygsoft.fr**, pas encore créé ni déployé. Aucun appareil ni service de production n'est contacté. Docker Compose est configuré mais son exécution reste à vérifier : le moteur Docker local était arrêté.

**EN** — The approved [MVP contract](docs/DECISIONS.md) supersedes the original design proposals below. Runtime schemas are in [src/contract.ts](src/contract.ts). Implemented: private product-scoped bearer access, products, editable drafts, multiple ordered artifacts, SHA-256 integrity, atomic publishing, withdrawal, audit history, exact compatible SemVer discovery, immutable manifests, resumable downloads, SQLite persistence, a responsive React administration UI and a retry-safe script publisher. No check automatically downloads or installs anything.

### Run locally

Use Node.js 24-26 (tested here on Node 26.9.0) and npm:

```sh
npm ci
npm run init
npm run build
npm start
```

Open **http://127.0.0.1:3210**. The init command creates random credentials in `.local/credentials.json` without displaying them or overwriting existing credentials. Sign in with the `local-admin` token from that file, then create the `meeting-agent` product in Products. The generated publisher and reader credentials are scoped to that product. Never share the file or paste credentials into chat. Authentication stays in memory; reloading requires signing in again. Only the System/Light/Dark preference is persisted in browser storage. English UI strings are centralized in `web/copy.ts`; French localization is not yet provided.

`npm run dev` starts from TypeScript source, but serves the last built UI. After frontend edits run `npm run build` again. The default catalog and artifact directory is `.local/data`. Override it with `DUH_DATA_DIR`; configure `DUH_PORT` and `DUH_CREDENTIALS_FILE` as needed. Keep native binding on loopback.

### Verify

```sh
npm test
npm run build
npm run test:e2e
npm audit
```

On Windows browser tests use installed Microsoft Edge, avoiding a browser download; override with `PLAYWRIGHT_CHANNEL=chrome` if needed. On Linux run `npx playwright install --with-deps chromium` first. Tests use generated credentials and isolated temporary data, not the running local catalog. Browser traces are disabled to avoid recording bearer headers. Screenshots are under `test-results` and are ignored by Git.

### Docker and scripts

After initializing credentials, `docker compose up --build -d` builds the application and mounts a durable named data volume. The published port is loopback-only. `docker compose down` retains the data; **do not use `down -v` unless intentional data loss is acceptable**. Native and Docker deployments use separate catalogs by default; do not run both on the same port or writable directory.

For HTTP, Node CLI, PowerShell and web publication, see [docs/DEVELOPERS.md](docs/DEVELOPERS.md), [examples/release-plan.json](examples/release-plan.json) and [examples/publish-http.ps1](examples/publish-http.ps1). The Node commands are `npm run publish:release`, `npm run check:update` and `npm run download:release`, each followed by `--` and its documented arguments. Discovery never downloads; downloading never installs. PowerShell 7 is optional, with its HTTP integration test skipped when unavailable.

Operational configuration/backups are in [docs/OPERATIONS.md](docs/OPERATIONS.md). Production signing, TLS, identity management, installers and Meeting integration are not implemented or approved. The planned origin is supported by developer clients but is not a running service; do not expose this MVP publicly.

### Source Versions and History

[CHANGELOG.md](CHANGELOG.md) is mandatory; maintain Unreleased for meaningful changes. Every source/configuration/document file, including workspace configuration, has a metadata-header version or an explicit entry in [versions.json](versions.json). File versions are distinct from application `0.1.0`, API `v1` and manifest/schema `1`.

After revising a file, increment its file version, then run:

```sh
npm run versions:record
npm run versions:check
```

The recorder refuses changed contents at an unchanged version. Tests and builds reject stale file/hash inventory. Git keeps source text at LF endings on Windows and Linux so byte-accurate snapshots remain portable. Record new comment-free files explicitly before recording; do not put comments in strict JSON. Generated builds, dependencies, credentials and persistent data are excluded. Current versions/hashes are authoritative in the inventory; [docs/DELIVERY.md](docs/DELIVERY.md) preserves the initial delivery snapshot separately. Never record secrets.

## 1. Overview / Présentation

**EN** — Device Update Hub is a self-hosted, containerized platform that centralizes the publication, discovery, distribution, and lifecycle management of software and firmware updates for heterogeneous devices. A single HTTP API serves devices, an administration web UI serves maintainers, and an authenticated publication API serves local development scripts and CI pipelines. Devices keep control of whether and when to install an available update. The platform can later become a Meeting extension without depending on Meeting for its first deployment.

**FR** — Device Update Hub est une plateforme auto-hébergée, conteneurisée, qui centralise la publication, la découverte, la distribution et la gestion des mises à jour logicielles et firmware pour des appareils hétérogènes. Une API HTTP unique dessert les devices, une interface web permet l'administration et une API sécurisée permet la publication depuis des scripts locaux ou la CI. **Vérifier une mise à jour ne signifie jamais l'installer.** Une intégration future à Meeting est envisagée, sans créer de dépendance dès le départ.

### Goals / Objectifs

- One update service for multiple device families and software products.
- One consistent client-facing update discovery contract, independent of operating system.
- Release management through a web interface: create, edit permitted metadata, publish, withdraw, archive, and inspect releases and their files.
- Scriptable publishing from a development machine or CI/CD.
- Delivery of one or several files that belong to the same release.
- Clear compatibility and version selection rules; no accidental cross-device updates.
- Traceable release and update activity with secure defaults.
- Standalone Docker deployment now; optional Meeting integration later.

### Non-goals for the first version

- No universal flashing or installation engine that can safely execute on every device.
- No automatic installation solely because a device performed a check.
- No reliance on Meeting's reverse tunnels, its database, or its authentication at launch.
- No forced fleet-wide remote execution or automatic configuration changes.
- No incremental/delta update engine, peer-to-peer distribution, or complex orchestration in the initial MVP.

## 2. Core principle / Principe

```text
Local developer / CI                 Administrator
       |                                  |
       | Authenticated publish API        | Web UI
       v                                  v
+---------------------------------------------------------+
|                 Device Update Hub                       |
|   REST API + Admin UI + Release Catalog + File Storage  |
+---------------------------------------------------------+
          ^                            |
          | Check current version      | Eligible release +
          | and device capabilities    | manifest / artifacts
          |                            v
     +----------+               +-------------+
     |  Device  | --download--> | Artifact API|
     +----------+               +-------------+
          |
          +-- Verify content, obtain user approval, install locally
              using that device's own updater/installer
```

**Important distinction:** the server selects and distributes a *compatible release*; the device-specific updater validates and applies it. The server does not assume that replacing a Linux package, flashing ESP firmware, and updating a Windows application are the same operation.

## 3. Concepts and data model

| Concept | Definition |
|---|---|
| **Product** | Independently versioned software/firmware component, e.g. `meeting-agent` or a device firmware. |
| **Device type** | Logical hardware/model family, e.g. `rpi-camera`, `esp32-cam`, `windows-client`. |
| **Variant / constraints** | Hardware revision, OS, CPU architecture, bootloader or updater compatibility limits. |
| **Channel** | Named distribution track such as `stable`, `beta`, or `dev`. |
| **Release** | Versioned, immutable published snapshot of a product, channel and compatibility rules. |
| **Artifact** | Binary, archive, configuration bundle, package, or other downloadable file within a release. |
| **Manifest** | Machine-readable description of the release, required files, hashes, sizes, compatibility and install hints. |
| **Device identity** | Optional registered identifier for per-device policy and auditing; **not** by itself an authentication credential. |
| **Publisher** | Authorized human, script, or CI job permitted to create and publish releases. |
| **Installation report** | Optional client event indicating download, verification, success or failure; not proof of success unless the device reports it. |

A release can contain multiple artifacts and can target one or several compatible device types. The compatibility rules are part of the release, not merely implied by its filename.

## 4. Expected user journeys / Parcours

### 4.1 Device: Check for update

1. A user chooses **Check for updates** on their device/application.
2. The device contacts the Update Hub over HTTPS and submits its product, device type, installed version, selected channel, and relevant platform/hardware capabilities; optionally a registered device identity.
3. The server authenticates the request according to the configured client-access policy, checks release status, compatibility, deployment policy and version ordering.
4. The server responds with either **no eligible update** or the **newest eligible release**, including version and metadata required to retrieve its manifest.
5. The device shows the result to the user. No download or installation occurs without the applicable client policy and user action.

An update must never be proposed merely because it has the highest version number. Compatibility, channel, release visibility, allowed device scope, and updater capabilities take precedence.

### 4.2 Device: Download and install

1. After the user chooses **Update**, the device retrieves the manifest and required artifacts.
2. The device validates the HTTPS connection, artifact sizes and SHA-256 hashes; it also validates cryptographic signatures where the applicable platform security policy requires them.
3. The device stages files without corrupting the currently running installation.
4. The **device-specific updater** applies files in the declared order or by its own trusted installation plan.
5. It verifies the new version / health as far as the platform permits and optionally reports the outcome.
6. On failure, it preserves diagnostics and uses the platform-specific recovery or rollback mechanism if supported.

**The hub only distributes trusted declarative metadata and files.** It must not turn server-provided manifest fields into unrestricted shell commands on devices.

### 4.3 Administrator: Manage a release

1. Create or choose a product, device type/compatibility profile, and channel.
2. Create a **draft** release with a version and release notes.
3. Upload, remove, or replace files **while the release remains a draft**.
4. Review file sizes, checksums, compatibility, required artifacts and manifest validity.
5. Publish the release explicitly.
6. Review release history and optionally withdraw or archive an obsolete release.

Published release files and version identity are **immutable**. To correct a published binary, publish a new version; to make a harmful release unavailable, withdraw it. Editable metadata after publication is limited to non-executable presentation fields with an audit trail. A delete action must not silently break downloads already in progress; destructive cleanup is a separate controlled operation.

### 4.4 Developer: Publish from a script

A local script or CI job can authenticate with a scoped publisher credential, initialize a draft release, upload one or more artifacts, submit its manifest, validate the draft and explicitly publish it. The process must be non-interactive, report failures with nonzero exit status and support idempotent retries. A minimal CLI may wrap these endpoints later; it is **not** a prerequisite for the API.

## 5. API v1 (local MVP)

Base path: `/api/v1`. The [approved contract](docs/DECISIONS.md) and strict runtime schemas govern the implemented endpoints below. A bearer credential is mandatory. Optional device event reporting and larger resource-management APIs remain deferred.

### 5.1 Device API

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/v1/updates/check` | Find the newest eligible release for a device/product/version/channel. |
| `GET` | `/api/v1/releases/{release_id}/manifest` | Retrieve the immutable manifest for an authorized release. |
| `GET` | `/api/v1/artifacts/{artifact_id}/download` | Download an authorized artifact, ideally with resumable HTTP ranges. |

Check request (all target fields are required and matched exactly):

```json
{
  "product": "meeting-agent",
  "current_version": "1.4.2",
  "channel": "stable",
  "target": {
    "device_type": "rpi-camera",
    "os": "linux",
    "architecture": "arm64",
    "hardware_revision": "rev-b",
    "updater_protocol": 1
  }
}
```

Illustrative positive response:

```json
{
  "update_available": true,
  "release": {
    "id": "65c68117-3141-4664-a761-12eea190cf22",
    "product": "meeting-agent",
    "version": "1.5.0",
    "channel": "stable",
    "release_notes": "Stability improvements",
    "manifest_url": "/api/v1/releases/65c68117-3141-4664-a761-12eea190cf22/manifest"
  }
}
```

Illustrative no-update response:

```json
{
  "update_available": false,
  "reason": "no_eligible_update"
}
```

A v1 manifest describes schema version, immutable release identity, exact targets, version and ordered required artifacts with stable IDs, sizes, SHA-256 hashes and protected relative download URLs. No signatures or arbitrary installation commands are included. Checks, manifest retrieval and downloads are separate operations.

Unknown input fields are rejected. Errors use `{ "error": { "code": "...", "message": "..." } }`. Missing credentials return 401; denied product/role access returns 403. Lifecycle conflicts return 409; invalid or corrupted publishable content returns 422. Protocol v1 accepts canonical SemVer without build metadata. Pagination and telemetry are deferred; do not use this MVP for an unbounded production catalog.

### 5.2 Administration API

Implemented authenticated resource groups:

- `GET/POST /api/v1/admin/products` — list permitted products; admins create them.
- `POST /api/v1/admin/releases/{id}/withdraw` — admins withdraw published releases.
- `GET /api/v1/admin/audit-events` — admins inspect the latest 100 mutations.
- `GET /api/v1/session` — inspect the authenticated role and product grants.
- Device types, channels and exact compatibility targets are explicit draft fields, not separate CRUD resources. Archival, product deletion and user/token administration UI are deferred.

### 5.3 Publisher API

Implemented authenticated flow (admin or product-scoped publisher):

1. `POST /api/v1/publishing/releases` — create or reuse a draft by idempotency key.
2. `POST /api/v1/publishing/releases/{id}/artifacts` — upload one multipart file, at most 64 MiB. Retry an identical filename/hash safely; partial uploads must restart. Resumable transfers apply to downloads, not uploads.
3. `PUT /api/v1/publishing/releases/{id}/manifest` — submit/update draft manifest.
4. `POST /api/v1/publishing/releases/{id}/validate` — receive errors and warnings.
5. `POST /api/v1/publishing/releases/{id}/publish` — atomically publish after validation.

`GET /api/v1/publishing/releases` lists permitted releases; `GET/PATCH .../{id}` inspects or edits a draft; `DELETE .../{id}/artifacts/{artifact_id}` removes a draft attachment. PATCH replaces all draft fields and invalidates the manifest. Create requires a principal-scoped `Idempotency-Key`. The script publisher handles these steps and retries. Reader credentials cannot mutate releases; publisher credentials cannot create products or withdraw releases.

## 6. Release and versioning rules

- Use Semantic Versioning (`MAJOR.MINOR.PATCH`, optionally prerelease) for products that support it.
- For firmware or legacy products with custom version strings, provide an explicit ordering/compatibility adapter; never compare version strings lexicographically.
- A product/channel/target selection must not contain ambiguous competing releases. Define priority and tie behavior before implementing.
- Candidate selection filters withdrawn, unpublished, incompatible, unauthorized or otherwise ineligible releases **before** ordering versions.
- `stable`, `beta`, and `dev` are separate tracks; a device does not silently switch tracks.
- A published release points to immutable, content-verified artifacts; publishing the same version with different bytes is prohibited.
- Drafts may be freely edited; published releases may be withdrawn, superseded or archived, but never silently rewritten.
- Downgrade and rollback availability require explicit policy and platform support; older versions are not implicitly offered as upgrades.
- Release identifiers are stable independently of human-facing versions.

## 7. Security baseline

- HTTPS is required for production client, publisher and administrative traffic.
- Authenticate administrators and publishers; use scoped, rotatable tokens for scripts and CI.
- `device_id` and Meeting's `device_key` are **identifiers, not secrets**. Do not use them alone to authorize protected downloads or administration.
- Define a deliberate policy for client read access (device credentials, signed short-lived download grants, or explicitly public artifacts) before deployment.
- Validate upload type, size, paths and manifest schema; prevent path traversal, unsafe archive extraction and arbitrary server-side execution.
- Use SHA-256 for transfer integrity. Design trusted artifact/manifest signing with key rotation for sensitive firmware and high-trust clients.
- Protect against replay and unauthorized downgrade according to product risk.
- Store secrets outside the image and repository; mount as environment secrets/configuration.
- Log publication, withdrawal, authentication-relevant changes and privileged actions; never log secrets or full bearer tokens.
- Apply sensible rate limits, upload quotas, download limits and storage retention policies.
- Prefer atomic publish and fail-closed behavior: an incomplete release must never be announced as installable.

## 8. Docker deployment model

**MVP target:** a standalone Docker Compose deployment exposing the web UI and REST API, with durable catalog data and artifact storage outside ephemeral container layers.

Logical components (the approved local implementation is intentionally single-instance):

- **Application service:** API, admin UI, authentication and release selection.
- **Catalog persistence:** relational database or an explicitly justified embedded database for an initial single-instance deployment.
- **Artifact storage:** persistent Docker volume or host-mounted directory; abstracted so object storage can be added later.
- **Optional worker:** asynchronous packaging, integrity verification, housekeeping, notifications and large uploads, if required by actual needs.
- **Reverse proxy/TLS termination:** existing HTTPS infrastructure or a dedicated proxy; do not expose unsecured admin APIs publicly.

Back up **both** catalog data and artifacts consistently. The MVP uses TypeScript/Fastify, React/Vite, SQLite and local content-addressed artifacts. Production proxy/TLS and deployment topology remain open. See [docs/OPERATIONS.md](docs/OPERATIONS.md) for backup and recovery requirements.

## 9. Web administration UI

The UI should eventually provide:

- Dashboard: releases, draft/published/withdrawn status, recent events and storage usage.
- Products and device types: names, channels, supported platforms/hardware and compatibility rules.
- Releases: create, edit drafts, upload files, validate, inspect manifest, publish, withdraw, archive.
- Artifacts: sizes, checksum, filenames, upload status and safe download previews.
- Activity/history: who published what and when; optional aggregate device check/update reports.
- Access control: administrator accounts and scoped publisher credentials.
- Internationalization: **English as the canonical UI language**, French localization supported from the start if feasible.

A UI must not be the only way to operate the service: all key release-management functions need authenticated APIs for automation.

## 10. Meeting interoperability (future, optional)

Meeting already describes device identities (`device_key`), `device_type`, distributions, heartbeats and an authenticated **Distrib Builder** publication flow in its existing documentation. This project should acknowledge those concepts without treating the older builder as an update-discovery/install protocol.

Potential integration points **to investigate later**:

- Map Meeting's `device_type` to Update Hub compatible targets.
- Associate Update Hub update status with devices known to Meeting.
- Allow Meeting's admin interface to link to or embed Update Hub views.
- Optionally bridge published Meeting distributions to Update Hub releases with explicit conversion rules.
- Reuse identity or authorization only through a designed, verifiable trust integration, never by assuming possession of `device_key` is sufficient.
- Keep the update check/download workflow working if Meeting is temporarily unavailable.

Do not modify Meeting schemas, agents, routes or UI until a separate integration proposal and compatibility plan have been approved.

**Documentation context (not a live code audit):** `integration.md`, `structure_globale.md`, `builder_api.md` and `encyclopedie-new.md` supplied with the Meeting project. They describe state last verified in 2025–early 2026; integration assumptions require later revalidation against the current code.

## 11. MVP acceptance criteria

The first working release should prove the following end-to-end behaviors:

- A standalone containerized instance starts with persistent data and a reachable web UI and API.
- An authenticated administrator creates one product, one device type and one release draft.
- One release can contain **multiple artifacts** and a validated manifest.
- A scripted publisher creates/updates a draft and publishes it without opening the UI.
- A device check with an older compatible version receives the newest **eligible** published version.
- An already-current, incompatible or differently channeled device receives no update.
- The device can download every required file and verify checksums.
- Running **Check for updates** alone never triggers installation.
- Published artifacts cannot be silently replaced; withdrawing a release removes it from new checks.
- An unauthorized publisher cannot publish; authentication and malformed input failures are handled safely.
- Application restart/redeployment does not lose release metadata or artifact bytes.

## 12. Delivery roadmap (proposal)

| Stage | Scope | Exit criterion |
|---|---|---|
| **0 — Design** | Agree terminology, threat model, schemas, release lifecycle, installation boundaries and stack. | Written contracts approved. |
| **1 — Core MVP** | Docker deployment, data/storage, admin UI, publisher API, check API, download API, multi-artifact releases. | All MVP acceptance criteria pass. |
| **2 — Client reference** | Reusable protocol client plus at least one platform-specific installer example. | Check → approve → download → validate → install works on a test device. |
| **3 — Reliability** | Signing, rollback guidance, resumable transfers, detailed reporting, backup/recovery and optional staged rollout. | Tests cover interrupted/bad updates and safe recovery. |
| **4 — Meeting link** | Optional identity/type/status interoperability or UI extension. | Integration design approved and Meeting remains functional without Update Hub. |

## 13. Open decisions / Décisions à prendre

The approved local choices are recorded in [docs/DECISIONS.md](docs/DECISIONS.md). Remaining decisions beyond that MVP:

1. Final product branding and ownership.
2. Production identities, SSO, credential expiry/revocation and multi-user administration.
3. Artifact and manifest signing, trust anchors and key rotation.
4. Trusted platform-specific installers and recovery strategies; no device family is installation-certified by this server.
5. Legacy version formats, updater dependencies, rollback and staged rollouts.
6. Production topology, TLS, domain names and multi-instance storage.
7. Meeting integration, independently reviewed before implementation.
8. Opt-in device telemetry and retention, if needed.
9. Disk quotas, automated garbage collection, pagination, migrations and tested disaster recovery at production scale.

## 14. Document governance

- The local MVP summary and approved contract describe implemented behavior; the broader product vision remains a roadmap, not a production-readiness claim.
- Local implementation was explicitly authorized on 2026-10-16. Production, live devices, installers and Meeting integration remain outside that authorization.
- Keep the canonical checkout paths `/README.md` and `/AGENTS.md` for GitHub/Codex compatibility.
- Each document carries its **own version** in the header. Increment the version whenever that document changes.
- For deliverables outside a repository, use a versioned bundle folder, e.g. `device-update-hub/v0.1.0/README.md`, retaining the canonical filename.
- Record significant design decisions and incompatible API changes before coding them.

---

*Initial specification: 0.1.0 — 2026-10-16.*
