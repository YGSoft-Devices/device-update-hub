<!-- File: /CHANGELOG.md | Version: 0.5.4 | Updated: 2026-10-16 -->
# Changelog

All notable project changes are recorded here. Application, API, schema and individual file versions are independent. Entries describe development snapshots, not production deployments or signed releases. No production release has been made.

## Unreleased

### Added

- Application 0.2.0 implements administrator-managed local accounts, Argon2id passwords, eight-hour HttpOnly/Secure/Strict sessions with CSRF enforcement, self-service password changes, last-admin protection and revocable expiring API tokens. Existing file-backed bearer clients stay compatible. Role/grant changes and password resets revoke relevant credentials immediately; secrets/hashes are omitted from account/audit responses.
- System now configures Synology backups: private IPv4/share, write-only AES-GCM protected secrets, UTC daily schedule, retention, connection test and explicit backup. The external host agent serializes Restic/rclone with updates, makes a verified offline copy, restarts the pinned Hub before transfer, checks the repository and runs retention only after success. No NAS destination was supplied; configuration remains disabled and live NAS/independent restore certification is outstanding. SMB 3 must be enforced on Synology because rclone has no minimum-dialect setting.
- Atomic additive schema 2 -> 3 migration and explicit package/exact-health support for schemas 2/3, plus protected read-only backup-key Compose overlay and account/backup/restore runbook. The separate host agent must be upgraded before schema-3 installation; rollback restores the previous volume before starting old binaries. No frozen release is modified.
- An incorrect current password reports a validation error without logging out a still-valid browser session; actual unauthorized-session responses still end the session.
- Restic's short backup-summary snapshot ID is resolved to exactly one matching full repository ID before check/retention/success. Debian 12's Restic 0.14.0 uses this short form; mismatched resolution fails without pruning.
- User-approved activation of the exact HTTPS origin through reverse proxy 192.168.1.247: a host Nginx gateway on reserved LAN address 192.168.1.93:3210, proxy-source/host allowlisting, HTTP-to-HTTPS redirection and streamed unlimited-size forwarding to unchanged loopback Docker. The operator enabled a valid external certificate and Force SSL; the route and authenticated API reads passed. No unrelated proxy host is authorized, no frozen image was rebuilt and general production gates remain open.
- User-authorized private Debian 12 deployment, with a dedicated operator-installed SSH key, official Docker packages, checksum-verified Node 24, protected exchange directories and a reproducible bootstrap script. The host updater uses `/usr/local/bin/node`; the exact HTTPS route was authorized subsequently as above. Exact installed layout, secret locations without values, image/job identities and remaining external-backup actions are recorded in `docs/DEPLOYMENT.md`.
- Admin System settings for persistent, audited artifact-size and upload-timeout controls. No application size cap by default; the original 64 MiB limit is removed from API schemas, multipart handling and both publishers. Transfers remain streamed; upload defaults to a one-hour budget configurable by admins.
- Signed Hub self-update packages (Ed25519), explicit admin discovery/confirmation, atomic shared-directory handoff, host presence/key checks, maintenance state, independent private staging and durable job records.
- External Linux/systemd updater with fixed Docker Compose operations, offline data backup, immutable image identity/platform validation, exact-version health verification, restore/rollback and fail-closed interrupted-job recovery. The web container has no Docker socket or host privileges.
- Packaging CLI, host/web policy examples, opt-in Compose mounts and systemd service definition. No privileged service or real container replacement has been executed on this Windows development host.
- Atomic schema 1 -> 2 migration with preservation tests, root-only synced previous-image recovery metadata, protected host-directory checks and bounded nonblocking file reads. Installation/recovery instructions are in `docs/SELF_UPDATE.md`.
- Mandatory standalone changelog, including the existing project history.
- Source-file version inventory verification and content snapshots. Changed contents require a higher file version before the inventory can be recorded again.
- System, Light and Dark appearance modes on sign-in and administration screens; theme preference persists independently of credentials and follows OS changes in System mode.
- Node reference client, discovery-only CLI and separate compatible-release download CLI with validated responses, SHA-256 checks, temporary-file cleanup and no installation or overwriting of conflicting files.
- Reusable release/check JSON examples and a PowerShell 7 HTTP publisher interoperable with the Node publisher's idempotency keys.
- Developer clients accept `https://updatehub.ygsoft.fr` in addition to loopback. The original client preparation did not create/contact it; its subsequent scoped activation is recorded above. Clients reject redirects, embedded URL credentials and unexpected origins.
- Developer guide for API, CLI, web publication, scoped CI secrets, exact compatibility and explicit downloads; operations/agent instructions updated to preserve these boundaries.

### Fixed

- Private deployment access now uses the user-reserved `192.168.1.93` address while retaining the existing `DockerPVE2.lan` SSH host-key identity. Services and healthy Hub 0.1.1 were verified after the reservation/reboot; the old temporary `.92` address is obsolete.
- Hub waiting screen tracks the requested version so an earlier successful job cannot trigger a reload while a new package is preparing; covered on desktop and mobile.
- Upload-size checkbox keeps its label aligned horizontally instead of inheriting the generic vertical form-label layout; verified at both viewport sizes.
- Docker build context now includes the complete allowlisted source inventory required by build-time version checks; credentials, local data and generated output remain excluded. Image execution is still unverified without a running Docker engine.
- Source text uses LF working-tree endings on Windows/Linux to keep byte-accurate version snapshots portable. The HTTP example avoids newer .NET-only hashing methods so PowerShell 7.0+ remains supported.
- The PowerShell publisher avoids assigning to automatic variables; editor diagnostics are checked alongside runtime integration tests.
- Theme screenshots finish entry animations before capture so the sign-in contrast is inspectable rather than caught mid-fade.

### Verification

- Signed 0.2.0 is frozen and deployed on the approved Debian target: successful job `81bd728b-5373-44c5-a921-1596f26f31eb`, exact schema-3 health, public TLS/HTTP301/auth reads, ready agents and preserved old catalog/settings/artifact hashes. Old 0.1.1 web rejects schema 3, so the initial migration used an authenticated, privately journaled operator handoff to the upgraded agent with full signature/hash/offline-backup checks, not a validation bypass. Complete stopped schema-2 data and pre-change host configuration are preserved; the runbook records paths. Final Windows/Linux backend suites each passed 31/32 with one platform skip, strict builds/inventories and audit passed; ten browser workflows plus the final two-viewport password-error regression passed. Real local Restic backup/full check/retention passed, but NAS settings remain null and independent NAS restore remains uncertified.
- New isolated identity/backup tests pass, including schema-2 preservation, session persistence/CSRF/revocation, last-admin protection, disabled-token reactivation refusal, secret redaction/encryption, offline-copy/restart/transfer ordering, scheduling, no purge after failure and retained local recovery. Ten desktop/mobile browser workflows passed, including account creation, password login/reload/logout and write-only Synology settings. The first full Windows run passed 29 of 30 tests (one POSIX skip); final counts and deployment acceptance are recorded separately. NAS credentials were not requested in chat or used in tests.
- Scoped HTTPS activation: target `nginx -t` passed; service enabled on the specific LAN address only. Public HTTP 301 redirects to HTTPS; native certificate validation, interface/health 200, anonymous admin 401, authenticated session/settings/host-agent reads 200 and direct LAN 403 even with spoofed forwarding headers passed. Browser sign-in rendering passed. Large public uploads and external-proxy timeouts remain unverified. The older local verification snapshot below predates the actual Linux deployment and HTTPS activation; no application test/build rerun was needed for this host-config/documentation-only change.
- Windows/Node.js 26.9.0: 28 Node tests, 27 passed and one POSIX permission/symlink test skipped. Coverage includes a real streamed 65 MiB publication, persisted settings/limits, schema migration, signed packages, explicit admin handoff, private re-verification, rollback, interrupted-job maintenance, packaging, Node/PowerShell interoperability and existing API/client/version checks. The deployment implementation is exercised through fakes, not real Docker operations.
- Eight Edge browser tests passed across desktop/mobile publication, theme persistence, admin settings, disconnected update waiting, rollback and exact-version reload. The slow-preparation/previous-success regression also passes on both viewports.
- Strict TypeScript/server/frontend build passed; 58 source-file versions verified; dependency audit reported zero vulnerabilities; base and self-update-overlay Compose configurations passed. Direct PowerShell analysis has no warnings/errors; VS Code retains a stale automatic-variable diagnostic. Docker image/runtime, actual backup restoration, systemd installation and POSIX permissions remain Linux staging gates. No planned-domain, production or live-device access occurred. File revision summary: `docs/DELIVERY.md`; canonical versions/hashes: `versions.json`.

## 0.1.1 - 2026-10-16 - Private Debian Pilot

- Deployed to the explicitly authorized Debian host with fresh product-scoped credentials, loopback-only Compose publication, protected read-only trust/config/status mounts and no web Docker socket. Operator access uses a private SSH tunnel on workstation port 3212, separate from the guarded isolated browser-test port 3211.
- Built and ran the image on Linux; verified 27 Node tests, with only PowerShell interoperability skipped there, and POSIX permissions/symlink checks passing.
- Published a signed approximately 93 MB three-artifact package and completed real host-agent replacement from 0.1.0 to 0.1.1 with offline backup and exact-version health. Signing private key remained on the operator workstation.
- Exercised a deliberately mismatched negative fixture 0.1.2; real offline restoration returned 0.1.1 with unchanged settings, manifest and downloaded artifact SHA-256 hashes. The negative fixture was withdrawn and its version remains reserved.
- Rebooted the host and confirmed Docker, the updater and the pinned healthy 0.1.1 container resumed automatically. Authenticated desktop/mobile browser checks passed through the deployed-server SSH tunnel.
- No public origin, live-device installer, automated external backup, power-loss certification or unattended installation policy was enabled. Updates still require explicit admin confirmation.

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