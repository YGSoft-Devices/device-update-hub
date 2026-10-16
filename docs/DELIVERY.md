<!-- File: /docs/DELIVERY.md | Version: 0.2.3 | Updated: 2026-10-16 -->
# Local MVP Delivery

Application package: `0.1.0`, a local development candidate, not a production release. API namespace: `v1`. Manifest schema: `1`. SQLite schema: `1`. Document/file versions below are independent of those runtime versions.

## Follow-up Delivery

The 2026-10-16 follow-up adds the separate backfilled [CHANGELOG.md](../CHANGELOG.md), enforced per-file versions/hash inventory, System/Light/Dark appearance, a safe Node reference reader, separate check/download commands, Node/PowerShell HTTP publishing examples and [developer integration documentation](DEVELOPERS.md). The planned HTTPS domain is prepared in client policy only; DNS/public deployment are absent. No API namespace, manifest schema, database schema or application package version changed.

Current file versions and content hashes are authoritative in [versions.json](../versions.json), not the historical list below. Run `npm run versions:record` after increasing changed file versions, then `npm run versions:check`; tests and builds enforce that inventory. Generated/secret/persistent files remain excluded. Local verification results for this follow-up are recorded in the changelog after running the required gates. Docker image execution and production gates remain unverified.

### Follow-up File Revisions

Relative to the initial delivery snapshot:

- `README.md`: `0.2.0` -> `0.3.1`; `AGENTS.md`: `0.2.0` -> `0.2.2`.
- `src/contract.ts`: `0.1.0` -> `0.2.0`; `scripts/publish.ts`: `0.1.1` -> `0.2.0`.
- `web/App.tsx`: `0.1.2` -> `0.2.0`; `web/styles.css`: `0.1.1` -> `0.2.0`.
- `web/copy.ts`, `web/main.tsx`: `0.1.0` -> `0.1.1`; `web/index.html`: `0.1.1` -> `0.1.2`.
- `tests/api.test.ts`: `0.1.4` -> `0.2.3`; `tests/browser/workflow.spec.ts`: `0.1.2` -> `0.2.1`.
- `Dockerfile`, `.dockerignore`: `0.1.0` -> `0.1.1`.
- `docs/DECISIONS.md`: `0.1.0` -> `0.1.1`; `docs/OPERATIONS.md`: `0.1.0` -> `0.2.0`; `docs/DELIVERY.md`: `0.1.0` -> `0.2.3`.
- `package.json` file version: `0.1.4` -> `0.2.0`; package/application version remains `0.1.0`. `versions.json` increments automatically when recording source revisions.
- `.gitattributes`: previously unversioned -> `0.1.2`, preserving text normalization and requiring LF working-tree endings.
- New `CHANGELOG.md`: `0.1.6`; `docs/DEVELOPERS.md`, `scripts/versions.mjs`, `scripts/check.ts`, `scripts/download.ts`, `examples/release-plan.json`, `examples/check-request.json`: `0.1.0` each.
- New `src/client.ts`, `web/theme.tsx`, `tests/versions.test.ts`: `0.1.1` each; `examples/publish-http.ps1`: `0.1.3`.

Other source/configuration files retain their recorded versions. No incompatible API/schema change or data migration is introduced. Complete revised files are in the workspace.

## Initial Verification Snapshot

The following results and inventory describe the initial MVP before the follow-up changes, not current test totals or file versions.

- Windows, Node.js 26.9.0: `npm test` passed 11 tests. Coverage includes exact compatibility, SemVer/prerelease/channel selection, no-update, authorization, multi-artifact publishing, duplicate/replayed publication, immutable metadata, withdrawal, malformed input, oversized/empty/unsafe uploads, bounded incomplete uploads, checksum failure, transaction rollback on audit failure, interrupted HTTP transfer with Range resume and persisted data after application restart.
- The script publisher was exercised over an actual HTTP listener with a publisher-only credential file, two artifacts, an identical retry and changed-byte rejection.
- `npm run build` passed strict TypeScript checks and emitted the backend, scripts and frontend, including locally hosted fonts.
- `npm run test:e2e` passed two complete Edge workflows at 1440x960 and 390x844. Each creates a product/draft, uploads two files, validates/publishes, inspects the manifest, switches to a reader, checks without downloading, downloads explicitly with SHA-256 verification, checks an already-current version, and withdraws as admin. Browser errors and horizontal document overflow are checked. Credentials are not stored in localStorage/sessionStorage.
- `npm audit`: zero reported vulnerabilities at validation time.
- `docker compose config --quiet` passed. Docker engine was unavailable, so image build, container lifecycle, volume permissions and container restart remain unverified. CI has been prepared for Node 24 and image build but has not been run on GitHub.
- No live device, installer, production endpoint or Meeting system was used. No changes were committed; this checkout did not contain Git metadata.

These checks do not certify installation safety, signatures, backup restoration, crash/power-loss behavior or production readiness.

## Initial Version Inventory

Revised existing documents:

- `README.md`: `0.1.0` -> `0.2.0`.
- `AGENTS.md`: `0.1.0` -> `0.2.0` (explicit user-approved local implementation boundary).

New server and tools (final file versions):

- `src/contract.ts`: new -> `0.1.0`.
- `src/store.ts`: new -> `0.1.0`.
- `src/app.ts`: new -> `0.1.5`.
- `src/server.ts`: new -> `0.1.0`.
- `scripts/init.ts`: new -> `0.1.0`.
- `scripts/publish.ts`: new -> `0.1.1`.
- `scripts/e2e-server.ts`: new -> `0.1.0`.

New frontend (final file versions):

- `web/App.tsx`: new -> `0.1.2`.
- `web/copy.ts`, `web/main.tsx`, `web/public/icon.svg`: new -> `0.1.0` each.
- `web/index.html`, `web/styles.css`: new -> `0.1.1` each.

New checks and deployment files (final file versions):

- `tests/contract.test.ts`: new -> `0.1.1`.
- `tests/api.test.ts`: new -> `0.1.4`.
- `tests/browser/workflow.spec.ts`: new -> `0.1.2`.
- `vite.config.ts`, `playwright.config.ts`, `Dockerfile`, `compose.yaml`, `.dockerignore`: new -> `0.1.0` each.
- `.gitignore`: new -> `0.1.1`.
- `.github/workflows/ci.yml`: new -> `0.1.0`.
- `docs/DECISIONS.md`, `docs/OPERATIONS.md`, `docs/DELIVERY.md`: new -> `0.1.0` each.

Comment-free files are tracked in `versions.json`: `package.json` at file version `0.1.4`, `package-lock.json` at `0.1.3`, `tsconfig.json` and `tsconfig.server.json` at `0.1.0`. The inventory manifest itself is `0.1.4`. Generated build output, dependencies, credentials, databases, browser screenshots and temporary test files are excluded from source versioning. Complete source files are available in the workspace; no file portions are omitted.

## Compatibility

The old README JSON was illustrative, not an implemented API. The approved strict v1 uses a nested `target` with numeric `updater_protocol: 1`, UUID release/artifact IDs, one product/channel/version identity and no build metadata. Integrators must use the actual runtime schemas rather than the initial illustration. Existing databases did not predate this implementation, so no data migration was required.