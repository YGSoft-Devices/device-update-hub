<!-- File: /AGENTS.md | Document version: 0.2.2 | Status: MVP AUTHORIZED | Updated: 2026-10-16 -->
# AGENTS.md — Device Update Hub

> **Location:** `/AGENTS.md` (repository root)  
> **Document version:** `0.2.2`  
> **Status:** Local MVP implementation authorized  
> **Last updated:** 2026-10-16

## 1. Agent role and authority

This document guides Codex and any other AI coding agent working on **Device Update Hub**.

The project is a standalone, Docker-deployed web administration platform and API for distributing updates to heterogeneous devices. It may integrate with Meeting in the future, but it must remain independently deployable until an explicit integration plan is accepted.

**Current authorization boundary: LOCAL MVP IMPLEMENTATION APPROVED on 2026-10-16.** The user explicitly approved TypeScript/Fastify, React/Vite, SQLite, local persistent artifacts, Docker Compose, private scoped bearer access, exact compatibility and the SemVer multi-artifact contract in `/docs/DECISIONS.md`. Implement and test this scope autonomously. No production deployment, live-device operation, installer or Meeting integration is authorized. Production signing and identity hardening remain open gates.

Before any later implementation task, read `/README.md` and this entire file. Distinguish approved requirements from illustrative API examples and unresolved design decisions.

## 2. Source of truth and precedence

1. The user's explicit current task and approved design decisions.
2. The current repository's `/AGENTS.md` and `/README.md`.
3. Accepted architectural decision records / written API and security contracts, once introduced.
4. Tests and actual implementation **after** coding starts.
5. Supplied historical Meeting documentation, as context only.

Do not treat proposed endpoints, example JSON, or historical Meeting routes as implemented, verified, or production-safe. Do not silently resolve an open decision by assuming a framework, database, authentication method or device installation strategy.

If a decision materially affects security, interoperability or data durability, document the trade-off and request approval before implementing that choice.

## 3. Hard project constraints

- Deliver a **single consistent update-discovery contract** that can support multiple device types and software products.
- The hub publishes and distributes releases; **installation is performed by platform-specific, trusted device-side updaters**.
- A **check** must never auto-download or auto-install an update as an accidental side effect.
- All release selections consider compatibility, channel, permission, status and version — not version alone.
- A release may include **multiple files** and must have a validated manifest.
- Publication must work through both a web interface and an authenticated scriptable API.
- Published binaries and their hashes are immutable; editing published release bytes in place is forbidden.
- Local deployment must be possible using Docker with persistent metadata and artifact storage.
- Meeting integration is optional and deferred. Avoid direct coupling to Meeting's database, tunnel protocol, tokens or device registration flow until explicitly designed.

## 4. Security-first rules

- Treat any network-exposed update service as a software supply-chain trust boundary.
- HTTPS for production. Protect admin and publish APIs with authorization and least-privilege scopes.
- `device_id` or Meeting's `device_key` is an identifier, **not an authentication secret**.
- No embedded passwords, shared secrets, private keys or access tokens in code, docs, fixtures, logs or container images.
- Validate user input, file paths, uploads, archive contents, release manifests and declared compatibility.
- Verify transport integrity and SHA-256 artifact checksums; establish a signing strategy for firmware or high-trust clients before production deployment.
- Do not execute arbitrary commands on devices from server-provided manifests.
- Ensure draft validation and release publication are atomic; incomplete artifacts must never become visible to update checks.
- Provide explicit withdrawal/disable operations and auditable administrative mutations.
- Preserve recovery paths during installation where supported; never assume all device families have an A/B partition or rollback capability.
- Do not expose production endpoints or run destructive diagnostics without user approval.

## 5. Device API design guidelines

Any eventual API contract should:

- Use a versioned namespace (proposed `/api/v1`).
- Support check, manifest retrieval and artifact download as separate operations.
- Model products, device types, hardware/OS/architecture variants, channels and installed version explicitly.
- Return the newest **eligible** published release, not just the globally latest version.
- Support structured no-update outcomes and meaningful errors.
- Allow multi-file releases with explicit ordering/dependencies when necessary.
- Support retry and resumable downloads where feasible, without changing released bytes.
- Use stable identifiers that are separate from version strings and display names.
- Keep backward compatibility explicit and version any incompatible protocol changes.
- Define idempotency and failure semantics for publishing and update reports.

The example request and response bodies in README are **illustrative**, not a finalized schema. Formalize the schema and test it before coding handlers or clients.

## 6. Publisher and administration guidelines

- Admin actions and scripted publication must expose equivalent core capabilities.
- Scoped publisher credentials must not have unrestricted admin rights.
- Draft artifacts may be added, removed and modified; published artifacts may not.
- Publishing requires validation and must be an explicit transition.
- A withdrawn release is excluded from new update checks, without erasing its audit history.
- Deletion/garbage collection must respect active downloads, retention and reproducibility.
- Ensure publisher operations can be retried safely after network interruption.

## 7. Implementation workflow (once authorized)

1. Inspect repository structure and read the current specs.
2. Identify the smallest approved deliverable and any blocking design decisions.
3. Make a short plan and enumerate affected paths.
4. Update or introduce a written contract and tests where needed.
5. Implement one coherent vertical slice rather than speculative infrastructure.
6. Run the relevant lint, unit, integration and security-oriented tests; report exact results and limitations.
7. Review storage persistence, backward compatibility, auth scopes and failure behavior.
8. Summarize changes, versions and any follow-up decisions; never claim tests passed when they were not run.

Prefer thin, documented abstractions. Avoid speculative layers or dependencies not justified by an accepted requirement.

## 8. File completeness, location and versioning — mandatory

The project's collaboration rules require **complete files**, never unexplained fragments or partial patches as the only deliverable.

For every file produced or revised:

1. Provide its **full contents** when presenting a file deliverable.
2. Identify the **repository-relative path** (e.g. `/api/...`, `/web/...`, `/README.md`).
3. Record a **file version** and bump it on **every revision of that file**. Do not reuse a previous version for changed contents.
4. Where the syntax permits, put a metadata header at the beginning of the file, for example `File: /path/to/file | Version: X.Y.Z` using an appropriate comment form.
5. For formats that prohibit comments or extra fields (strict JSON, lockfiles, binary files, etc.), maintain the path/version mapping in a separate version manifest or release inventory rather than breaking the file format.
6. Keep canonical convention-sensitive names (`README.md`, `AGENTS.md`, `Dockerfile`, etc.) intact. When delivering multiple snapshots outside Git, put files in a **versioned directory** (`device-update-hub/v0.1.0/...`) rather than renaming away from conventions.
7. Summarize changed paths and their previous/new versions. Apply semantic version increments appropriate to the change and document any breaking changes.
8. Never omit unchanged portions of a modified file with placeholders such as `// existing code` or `...`.

Keep specifications, schema versions, application versions and individual file/document versions conceptually separate. A file's updated version does not imply that the application has been released.

`/CHANGELOG.md` is mandatory: maintain its Unreleased section for every meaningful change and preserve the existing history. Every source/configuration/document file must have a header version or an explicit version in `/versions.json`, including workspace and repository configuration. Generated builds, dependencies, credentials and persistent data are not source deliverables and must remain excluded. After each source revision, increment the file version and run `npm run versions:record`, then `npm run versions:check`. Recording refuses changed contents at an unchanged version; tests/builds reject an inventory that is out of date. Never bypass these checks or record secrets.

## 9. Language and documentation

- **Conversation with the user:** French.
- **Source code, identifiers, endpoints, schemas, tests and canonical technical terminology:** English.
- **Product documentation:** English or English/French bilingual; avoid French-only technical interfaces.
- **UI:** English as source language; make French localization possible without embedding translatable text into business logic.
- Keep docs honest about what is implemented, proposed and deferred.
- Update README/AGENTS and other relevant docs when a validated behavior or architectural decision changes.
- If a feature or fix is accepted, maintain the files Codex needs for correct future work, notably this `AGENTS.md` and any scoped agent instructions.

## 10. Testing expectations after implementation starts

Test at minimum:

- No-update for an already-current version.
- Positive update for an older compatible version.
- Rejection of incompatible device types, hardware and architecture.
- Channel isolation and version comparison including prereleases.
- Withdrawn, unpublished and unauthorized releases are never offered.
- Multiple required artifacts, checksum mismatches and interrupted downloads.
- Safe publishing failure/rollback at transaction boundaries.
- No mutation of published artifacts or manifests.
- Script publishing with least-privilege credentials and safe retries.
- Malformed inputs, path traversal attempts and oversized uploads.
- Restart or redeployment with metadata and artifacts intact.
- Future client installer tests appropriate to each device/OS (installation is out of scope for initial server-only MVP).

Use sandbox/test credentials and local fixtures. Never conduct update tests against live devices without explicit permission.

## 11. Future Meeting integration guardrails

Historical Meeting docs mention:

- `device_key` and `device_type` as existing device concepts.
- Heartbeat/status endpoints for device presence.
- A Distrib Builder publishing workflow and a `distribution` concept.
- Reverse tunneling and administrative workflows.

Those are **potential mapping points, not a signed integration contract**. Before integrating, inspect Meeting's current repository/source and validate its actual API, authorization, data model and compatibility. Do not share database tables or reuse Meeting credentials by default. Do not modify Meeting without a separately approved migration/integration plan.

## 12. Immediate next step

Develop the approved local MVP in `/docs/DECISIONS.md`. Runtime contracts live in `/src/contract.ts`; keep tests beside the existing suites under `/tests`. Run `npm test`, `npm run build`, and browser workflow tests before declaring the local MVP functional. Keep secrets and persistent data out of version control and the image. Update document/file versions on every revision; comment-free files are tracked in `/versions.json`. Complete file contents are available in the workspace; do not paste large files into chat unless requested.

The planned origin is `https://updatehub.ygsoft.fr`; DNS and production deployment are not yet available or authorized. Developer clients may prepare for this exact HTTPS origin, but local tests must not contact it. Keep native/Compose exposure on loopback, same-origin relative API URLs, certificate verification and redirect refusal. Future public activation requires separate approval and production security gates.

Maintain `/docs/DEVELOPERS.md` and the versioned `/examples` when publication/client contracts change. Node and PowerShell publishers share retry semantics and stable principal-scoped idempotency keys. Discovery must remain independent from manifest retrieval/download; reference downloads validate compatibility and bytes without installing or overwriting conflicting files. Preserve System/Light/Dark modes; only theme preferences, never credentials, may persist in browser storage. Docker's allowlisted build context must include all versioned source required by the inventory checks, but no credentials, data or generated output.

---

*Agent instructions: 0.2.2 — 2026-10-16. Initial specification retained as historical context.*
