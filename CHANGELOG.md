<!-- File: /CHANGELOG.md | Version: 0.1.6 | Updated: 2026-10-16 -->
# Changelog

All notable project changes are recorded here. Application, API, schema and individual file versions are independent. Entries describe development snapshots, not production deployments or signed releases. No production release has been made.

## Unreleased

### Added

- Mandatory standalone changelog, including the existing project history.
- Source-file version inventory verification and content snapshots. Changed contents require a higher file version before the inventory can be recorded again.
- System, Light and Dark appearance modes on sign-in and administration screens; theme preference persists independently of credentials and follows OS changes in System mode.
- Node reference client, discovery-only CLI and separate compatible-release download CLI with validated responses, SHA-256 checks, temporary-file cleanup and no installation or overwriting of conflicting files.
- Reusable release/check JSON examples and a PowerShell 7 HTTP publisher interoperable with the Node publisher's idempotency keys.
- Developer clients accept the planned `https://updatehub.ygsoft.fr` origin in addition to loopback. The domain is not created or contacted by this change; public deployment remains unapproved. Clients reject redirects, embedded URL credentials and unexpected origins.
- Developer guide for API, CLI, web publication, scoped CI secrets, exact compatibility and explicit downloads; operations/agent instructions updated to preserve these boundaries.

### Fixed

- Docker build context now includes the complete allowlisted source inventory required by build-time version checks; credentials, local data and generated output remain excluded. Image execution is still unverified without a running Docker engine.
- Source text uses LF working-tree endings on Windows/Linux to keep byte-accurate version snapshots portable. The HTTP example avoids newer .NET-only hashing methods so PowerShell 7.0+ remains supported.
- The PowerShell publisher avoids assigning to automatic variables; editor diagnostics are checked alongside runtime integration tests.
- Theme screenshots finish entry animations before capture so the sign-in contrast is inspectable rather than caught mid-fade.

### Verification

- Windows/Node.js 26.9.0: 17 unit/integration tests passed, including Node and PowerShell publication retries, separate reader CLI checks/downloads, integrity/overwrite protection, example schemas and version enforcement. Four Edge browser tests passed across desktop/mobile workflows and System/Light/Dark persistence.
- Strict TypeScript/server/frontend build passed; 46 source-file versions verified; dependency audit reported zero vulnerabilities; Compose configuration passed. Docker image/runtime verification remains blocked by the unavailable Linux engine. No planned-domain, production or live-device access occurred. File revision summary: `docs/DELIVERY.md`; canonical versions/hashes: `versions.json`.

## 0.1.0 - 2026-10-16 - Local MVP

### Added

- User-approved TypeScript/Fastify API, React/Vite administration UI, SQLite catalog and persistent content-addressed artifacts.
- Private bearer access with distinct administrator, product-scoped publisher and product-scoped reader permissions. Generated credentials remain outside source control.
- Product creation, editable release drafts, multi-file uploads, ordered required artifacts, strict manifests and atomic publication with audit records.
- Canonical SemVer discovery filtered by exact device type, OS, architecture, hardware, updater protocol, channel, permission and publication status.
- Immutable published files and manifests; explicit withdrawal blocks new checks, manifests and downloads.
- Separate discovery, manifest retrieval and authenticated artifact downloads, including HTTP ranges, SHA-256 integrity checks and interrupted-download recovery.
- Retry-safe command-line publisher with least-privilege credentials and changed-content rejection.
- Responsive administration and reader workflows; locally hosted fonts and an explicit local icon.
- Non-root Docker image and loopback-only Compose configuration with persistent data, read-only credentials and restricted container capabilities.
- Eleven server/contract tests, two complete desktop/mobile browser workflows and GitHub Actions configuration.
- Local operations, backup/restore, credential rotation, accepted decisions and delivery/version documentation.

### Fixed During MVP Development

- Windows temporary-file synchronization uses a writable descriptor.
- Refused uploads consume their streams; incomplete multipart transfers have an explicit deadline and controlled temporary-file cleanup.
- JSON content type is omitted for requests without a JSON body.
- Creation retries preserve their idempotency key; repeated script publication verifies the original inventory and order.
- Static-file and multipart dependencies were updated; the dependency audit reported no vulnerabilities at MVP validation time.

### Validation And Limits

- Local compilation, eleven server tests and two Edge browser workflows passed on Windows with Node.js 26.9.0.
- Compose configuration was validated, but Docker image/container execution was not: the local engine was stopped. GitHub CI was prepared, not executed.
- No production deployment, live device, installer, signing infrastructure or Meeting integration was performed.

## Initial Specification - 2026-10-16

- Added README and agent guidance at document version 0.1.0 covering update discovery, publishing, compatibility, multi-artifact releases, security and future Meeting integration.
- Subsequently approved local MVP implementation and advanced README/AGENTS to document version 0.2.0. The accepted contract is in docs/DECISIONS.md.