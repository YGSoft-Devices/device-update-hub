<!-- File: /docs/DELIVERY.md | Version: 0.6.3 | Updated: 2026-10-16 -->
# Local MVP Delivery

Current source package: `0.2.0`, catalog schema `3`, API `v1`, manifest/package schema `1`. The deployment runbook records active signed images separately. Earlier snapshots describe versions 0.1.0/0.1.1 and schemas 1/2, not current implementation. File/document versions remain independent.

## Accounts and Encrypted Backups

User-approved local accounts and SMB Synology backups are implemented; see [ADMINISTRATION.md](ADMINISTRATION.md). Isolated tests and ten desktop/mobile browser workflows pass. A real NAS was not configured, so live backup, retention on that destination and independent restore remain acceptance gates. General identity/MFA/off-host alerting gates are not implied by password support. The separate host-agent upgrade and schema-2 offline backup must precede schema-3 package installation.

Signed 0.2.0 is now frozen/deployed: release `1c186501-f1d5-4aa2-8ad3-9a6b21aa9486`, successful job `81bd728b-5373-44c5-a921-1596f26f31eb`, exact schema-3 health and authenticated public HTTPS acceptance. Both agents are ready; named users and NAS settings remain for the operator to configure. All old releases/settings and frozen artifact hashes were verified. Final Windows/Linux suites each passed 31 of 32 with one platform skip; strict builds, audit and inventory passed. Ten browser workflows passed plus the final password-error case on both viewports. See [DEPLOYMENT.md](DEPLOYMENT.md) for the initial schema-3 operator handoff and stopped schema-2 recovery copies. Documentation-only follow-up versions: README 0.7.1, AGENTS 0.5.1, CHANGELOG 0.5.4, DEPLOYMENT 0.3.0, SELF_UPDATE 0.3.1 and this document 0.6.3; no frozen image is rebuilt for these notes.

New files: `src/identity.ts` 0.1.2, `src/backups.ts` 0.1.3, `web/Administration.tsx` 0.1.2, `tests/identity.test.ts` 0.2.0, `tests/backups.test.ts` 0.2.1, `compose.backup.yaml` 0.1.0 and `docs/ADMINISTRATION.md` 0.1.0. Real Debian tools were exercised against disposable local data, not a NAS: rclone stdin obscuring, Restic 0.14.0 backup, complete integrity check and retention. Short snapshot IDs are resolved to full IDs before success.

File revisions relative to the scoped-HTTPS delivery:

- `src/app.ts` 0.3.1 -> 0.4.1; `src/store.ts` 0.2.0 -> 0.3.1; `src/server.ts` 0.2.0 -> 0.3.0; `src/hub-update.ts` 0.1.8 -> 0.2.0; `src/docker-deployment.ts` and `scripts/host-updater.ts` 0.1.3 -> 0.2.0.
- `web/App.tsx` 0.3.2 -> 0.4.2; `web/copy.ts` 0.3.1 -> 0.4.0; `web/System.tsx` 0.2.2 -> 0.3.0; `web/styles.css` 0.3.2 -> 0.4.1.
- `tests/api.test.ts` 0.3.2 -> 0.4.0; `tests/hub-update.test.ts` 0.2.3 -> 0.3.0; `tests/browser/workflow.spec.ts` 0.3.3 -> 0.4.1.
- `package.json` file 0.3.1 -> 0.4.0, app 0.1.1 -> 0.2.0; lockfile 0.1.4 -> 0.1.6, adding Argon2 native packages. `.dockerignore` 0.1.2 -> 0.1.3; `examples/hub-package.json` 0.1.0 -> 0.1.1.
- `AGENTS.md` 0.4.3 -> 0.5.0; `README.md` 0.6.0 -> 0.7.0; `CHANGELOG.md` 0.4.1 -> 0.5.1; `docs/DECISIONS.md` 0.2.1 -> 0.3.0; `docs/SELF_UPDATE.md` 0.2.1 -> 0.3.0; `docs/DEVELOPERS.md` 0.2.1 -> 0.3.0; `docs/OPERATIONS.md` 0.4.1 -> 0.5.0; this document 0.5.0 -> 0.6.0. Post-deployment status revisions are recorded in the canonical inventory/runbook.

The inventory records exact current versions/hashes (68 files); frozen published artifacts remain unchanged. Earlier delivery sections below are historical snapshots.

## Scoped HTTPS Activation

The operator created the domain and authorized only https://updatehub.ygsoft.fr through proxy 192.168.1.247. The new host Nginx gateway accepts that source and exact Host at reserved address 192.168.1.93:3210 while Docker remains on loopback. The operator enabled the certificate and Force SSL. Native certificate validation, HTTP 301 -> HTTPS, browser sign-in rendering, healthy 0.1.1, authenticated admin reads/agent readiness, anonymous 401 and direct-LAN 403 (including spoofed forwarding headers) passed. Large public uploads/external-proxy timeouts are not certified. General identity, off-host backup and device-installation gates remain open; no published image or API/schema changed.

File revisions for this route: `AGENTS.md` 0.4.1 -> 0.4.3; `README.md` 0.5.1 -> 0.6.0; `CHANGELOG.md` 0.3.3 -> 0.4.1; `docs/DEPLOYMENT.md` 0.1.2 -> 0.2.0; `docs/DEVELOPERS.md` 0.2.0 -> 0.2.1; `docs/OPERATIONS.md` 0.4.0 -> 0.4.1; `docs/SELF_UPDATE.md` 0.2.0 -> 0.2.1; this document 0.4.2 -> 0.5.0. New file: `deployment/reverse-proxy-gateway.conf` 0.1.0. The inventory increments when recorded and remains authoritative. The following sections retain earlier delivery snapshots.

## Authorized Debian Deployment

[DEPLOYMENT.md](DEPLOYMENT.md) records the approved target, exact image ID, update/rollback jobs, protected credential paths, SSH access, systemd/Compose operations, successful host reboot and residual gates. Real Linux image build/start, signed replacement 0.1.0 -> 0.1.1, negative health-version rollback, restored artifact hashes/settings, and desktop/mobile deployed browser checks passed. Public exposure was not part of that earlier private-deployment approval; the scoped route above was authorized subsequently. Generic device installs remain unauthorized.

File revisions for this deployment: `AGENTS.md` 0.3.1 -> 0.4.1; `README.md` 0.4.1 -> 0.5.1; `CHANGELOG.md` 0.2.2 -> 0.3.3; `deployment/device-update-hub-updater.service` 0.1.0 -> 0.1.1; `docs/OPERATIONS.md` 0.3.1 -> 0.4.0; `docs/SELF_UPDATE.md` 0.1.1 -> 0.2.0; this document 0.3.3 -> 0.4.2. New files: `deployment/bootstrap-debian.sh` 0.1.0 and `docs/DEPLOYMENT.md` 0.1.2. The operator subsequently reserved 192.168.1.93, replacing temporary .92; host-key identity and healthy services were verified after that reboot. Strict JSON file versions: `package.json` 0.3.0 -> 0.3.1 and `package-lock.json` 0.1.3 -> 0.1.4, changing only application version 0.1.0 -> 0.1.1, not dependencies. The canonical inventory records exact final versions/hashes, including its own revision. The signed image stays immutable when subsequent source documentation advances.

## Signed Self-update and Configurable Uploads

The subsequent user-approved change adds persistent admin upload settings (unlimited size by default), the System UI, signed Hub packages and the external Linux/systemd updater. Database schema moves from 1 to 2 through a tested atomic additive migration; application package stays `0.1.0`, API stays `v1`, generic release manifest schema stays `1`. Hub package schema `1` is separate. Full procedure and unverified Linux deployment gates: [SELF_UPDATE.md](SELF_UPDATE.md).

Changes relative to the preceding inventory:

- `src/contract.ts`: `0.2.0` -> `0.3.1`; `src/store.ts`: `0.1.0` -> `0.2.0`; `src/app.ts`: `0.1.5` -> `0.3.1`; `src/client.ts`: `0.1.1` -> `0.2.0`; `src/server.ts`: `0.1.0` -> `0.2.0`.
- `scripts/publish.ts`: `0.2.0` -> `0.3.0`; `examples/publish-http.ps1`: `0.1.3` -> `0.2.0`.
- `web/App.tsx`: `0.2.0` -> `0.3.2`; `web/copy.ts`: `0.1.1` -> `0.3.1`; `web/styles.css`: `0.2.0` -> `0.3.2`; `vite.config.ts`: `0.1.0` -> `0.1.1`.
- `tests/api.test.ts`: `0.2.3` -> `0.3.2`; `tests/browser/workflow.spec.ts`: `0.2.1` -> `0.3.3`.
- `package.json` file version: `0.2.0` -> `0.3.0`; `.dockerignore`: `0.1.1` -> `0.1.2`. Dependencies/lockfile unchanged. Inventory manifest increments when recorded.
- `README.md`: `0.3.1` -> `0.4.1`; `AGENTS.md`: `0.2.2` -> `0.3.1`; `docs/DECISIONS.md`: `0.1.1` -> `0.2.1`; `docs/DEVELOPERS.md`: `0.1.0` -> `0.2.0`; `docs/OPERATIONS.md`: `0.2.0` -> `0.3.1`; this document: `0.2.3` -> `0.3.3`. Changelog revisions are recorded in the canonical inventory.
- New versioned modules: `src/hub-update.ts` (`0.1.8`), `src/docker-deployment.ts` (`0.1.3`), `scripts/host-updater.ts` (`0.1.3`), `scripts/package-hub.ts` (`0.1.0`), `web/System.tsx` (`0.2.2`), `tests/hub-update.test.ts` (`0.2.3`), `docs/SELF_UPDATE.md` (`0.1.1`).
- New `0.1.0` files: `deployment/device-update-hub-updater.service`, `compose.self-update.yaml`, `examples/host-updater.json`, `examples/web-update.json`, `examples/hub-package.json`.

Complete files and authoritative current versions/hashes are in the workspace/inventory. Host commands use isolated fakes in tests; no resident service or privileged replacement has run here. See CHANGELOG verification for exact final counts and limitations.

## Earlier Follow-up Snapshot

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