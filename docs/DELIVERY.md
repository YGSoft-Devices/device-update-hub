<!-- File: /docs/DELIVERY.md | Version: 0.1.0 | Updated: 2026-10-16 -->
# Local MVP Delivery

Application package: `0.1.0`, a local development candidate, not a production release. API namespace: `v1`. Manifest schema: `1`. SQLite schema: `1`. Document/file versions below are independent of those runtime versions.

## Verification

- Windows, Node.js 26.9.0: `npm test` passed 11 tests. Coverage includes exact compatibility, SemVer/prerelease/channel selection, no-update, authorization, multi-artifact publishing, duplicate/replayed publication, immutable metadata, withdrawal, malformed input, oversized/empty/unsafe uploads, bounded incomplete uploads, checksum failure, transaction rollback on audit failure, interrupted HTTP transfer with Range resume and persisted data after application restart.
- The script publisher was exercised over an actual HTTP listener with a publisher-only credential file, two artifacts, an identical retry and changed-byte rejection.
- `npm run build` passed strict TypeScript checks and emitted the backend, scripts and frontend, including locally hosted fonts.
- `npm run test:e2e` passed two complete Edge workflows at 1440x960 and 390x844. Each creates a product/draft, uploads two files, validates/publishes, inspects the manifest, switches to a reader, checks without downloading, downloads explicitly with SHA-256 verification, checks an already-current version, and withdraws as admin. Browser errors and horizontal document overflow are checked. Credentials are not stored in localStorage/sessionStorage.
- `npm audit`: zero reported vulnerabilities at validation time.
- `docker compose config --quiet` passed. Docker engine was unavailable, so image build, container lifecycle, volume permissions and container restart remain unverified. CI has been prepared for Node 24 and image build but has not been run on GitHub.
- No live device, installer, production endpoint or Meeting system was used. No changes were committed; this checkout did not contain Git metadata.

These checks do not certify installation safety, signatures, backup restoration, crash/power-loss behavior or production readiness.

## Version Inventory

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