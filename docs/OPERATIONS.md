<!-- File: /docs/OPERATIONS.md | Version: 0.5.0 | Updated: 2026-10-16 -->
# Local Operations

The user-authorized Debian pilot, exact active HTTPS route, filtered host gateway, protected credentials, SSH tunnel, tested self-update/restore and host-reboot results are documented in [DEPLOYMENT.md](DEPLOYMENT.md). Its deployed version is 0.1.1; use its protected image override for lifecycle operations. The generic instructions below also cover native/local development.

## Configuration

Application 0.2.0 adds named accounts/cookie sessions and administrator-configurable encrypted Synology backups. See [ADMINISTRATION.md](ADMINISTRATION.md) for host Restic/rclone/key setup, first admin, scheduling/retention, schema 2 -> 3 backup/migration and independent restore. The legacy credential-file procedure below still applies to bootstrap/script credentials, not password changes managed by the new account UI. Do not run older binaries against schema 3; rollback must restore the complete schema-2 copy first. NAS destination/real restore remain unverified until the operator configures them.

`DUH_DATA_DIR` defaults to `.local/data`; it contains `catalog.db`, possible SQLite WAL/SHM sidecars, immutable `blobs` named by SHA-256 and temporary `staging` files. `DUH_CREDENTIALS_FILE` defaults to `.local/credentials.json`. `DUH_HOST` defaults to `127.0.0.1`; `DUH_PORT` defaults to `3210`. Non-loopback native binding is refused. `DUH_CONTAINER=1` is reserved for the loopback-published local Compose service, not a production security switch.

Provision credentials using `npm run init`. `DUH_PRODUCT` can change the generated publisher/reader product grant before the first initialization. Initialization never overwrites an existing file. Credentials use 32 random bytes, independent admin/publisher/reader roles and explicit product grants; comparison uses constant-time SHA-256 digests. The source credential file itself is secret and contains plaintext bearer keys. No token management UI, expiry or hot reload is provided. Do not enable browser network traces or HTTP request dumps containing authorization headers.

POSIX files are created with restrictive modes. On Windows, apply an NTFS ACL limited to the operator account and required system/backup accounts; POSIX mode bits do not enforce Windows access control. Do not store secrets or database directories on shared folders. Keep backups separately encrypted. The local MVP does not harden a compromised OS account.

## Script Publishing

Create a local plan next to your own artifact files. The plan is strict JSON, for example:

```json
{
  "product": "meeting-agent",
  "version": "1.0.0",
  "channel": "stable",
  "release_notes": "First local release",
  "targets": [
    {
      "device_type": "rpi-camera",
      "os": "linux",
      "architecture": "arm64",
      "hardware_revision": "rev-b",
      "updater_protocol": 1
    }
  ],
  "files": ["application.bin", "settings.json"]
}
```

Then run `npm run publish:release -- path/to/plan.json`. Relative file paths resolve from the plan directory. Array order is the required artifact order. The product must already exist. The script selects a publisher credential authorized for the product, not an admin key. `DUH_BASE_URL` accepts loopback origins or the active `https://updatehub.ygsoft.fr` origin only; the latter requires deployment credentials and must not be used for isolated tests. Redirects are refused. Native/Compose binding remains local.

Prefer `DUH_TOKEN_FILE` containing a single scoped token for publisher CI isolation, or `DUH_TOKEN` supplied by a trusted process environment; do not set both. Alternatively, `DUH_CREDENTIALS_FILE` can select a publisher-only credential-array file. Do not distribute an admin key with publisher jobs. See [DEVELOPERS.md](DEVELOPERS.md) for runnable Node/PowerShell HTTP examples, API contracts, web workflows and separate reader check/download commands. Discovery does not download; the reference downloader never installs and does not overwrite conflicting files.

The create request uses a stable product/channel/version idempotency key. Identical upload retries return the existing attachment. The script validates inventory/hashes and manifest ordering before publication. Repeating an identical plan after success is safe. Changed content under an existing filename or published version is refused; use a new version. Extra draft files are not silently deleted. Uploads are not resumable: retry the complete file. Files must be non-empty, have portable basenames and total at most 32 per release. Admin System settings control maximum size (off by default) and upload deadline (default 3600 seconds, configurable 1-86400). The 64 MiB cap is removed. Settings persist in SQLite, are audited and apply to subsequent uploads. Publishers read `/api/v1/publishing/limits`; reverse-proxy size/time limits remain independent. There is no aggregate disk quota yet; operators must monitor disk space.

## Backup and Restore

1. Stop the single application writer gracefully. Native: stop the running server. Docker: `docker compose stop hub`.
2. Copy the entire data directory or named volume, not only `catalog.db`. Include database sidecars, `blobs` and the directory structure. Do not copy an actively changing SQLite/WAL directory as an ordinary file backup.
3. Back up credentials separately into protected storage. Treat the data backup as sensitive release and audit information.
4. Restore the complete data set to an empty directory/volume while the application is stopped; set ownership for the native user or container UID 1000. Preserve the original copy until restore verification is complete.
5. Restart with the matching application and credentials; authenticate, inspect published manifests, download every required artifact and verify SHA-256 against the manifest before trusting the recovery.

Restart persistence is integration-tested. Off-host restore, actual power-loss durability, Windows filesystem crash semantics and physical disk failure are not certified. Linux directory sync and SQLite full synchronous commits reduce crash windows but do not replace backups. Schema 1 is atomically migrated to schema 2 by this revision, adding settings without rewriting releases/audit. Back up the stopped complete data set first; old binaries cannot open schema 2. Unsupported future database versions fail closed. Future schema migrations require an explicit plan and pre-migration backup.

## Credential Rotation

1. Stop the service, preserve stable credential IDs for unchanged principals, and back up the credential file securely.
2. Generate new 32-byte random hex values outside chat/logs and update only intended tokens/grants in the protected file. Different credentials must have unique IDs and tokens. Non-admin product grants are explicit slugs.
3. Restart; removed/rotated keys are immediately unusable for new requests. Browser sessions must sign in again.

Changing a credential ID also changes its create-idempotency namespace. Use publisher script inventory checks and release uniqueness to avoid unintended duplicate attempts.

## Local Docker

`docker compose config --quiet` validates the Compose configuration without running Docker. `docker compose up --build -d` requires a running Linux Docker engine and enough free disk space. Check `docker compose ps` and `/health`. The container runs as a non-root user with a read-only root filesystem, dropped capabilities, a bounded `/tmp` and a persistent named data volume. Credentials are mounted read-only as a Compose secret, not copied into the image. The build context is allowlisted by `.dockerignore`.

The Windows validation machine had Docker Desktop stopped and little free disk, so initial checks were native-only. The subsequently authorized Debian target has now built/run the image and passed real signed replacement, offline restore and host-reboot validation; see [DEPLOYMENT.md](DEPLOYMENT.md). Do not start native and Compose instances against the same writable SQLite directory. A different published local port can be selected with `DUH_PORT`; keep Docker loopback-only even with the approved external HTTPS route.

## Optional Hub Host Updater

[SELF_UPDATE.md](SELF_UPDATE.md) documents the separately approved Linux/systemd service, protected trust policy, opt-in Compose overlay, signed package and recovery. It is disabled unless `DUH_UPDATE_CONFIG_FILE` selects protected container configuration and a matching host heartbeat exists. Keep inbox writable, status/config/key read-only, and Docker access solely in the host agent. Normal mutations return 503 during maintenance; health/read/status remain available until container shutdown. The agent's image/backup/private journal are independent of the application database. Actual replacement/restoration has passed on the designated Debian pilot; other deployments must validate their own storage, permissions and recovery. Power-loss and off-host disaster recovery remain uncertified.

## Remaining Production Gates

HTTPS termination, reviewed signing operations and identity hardening are mandatory before any production proposal. The Hub-only Ed25519 package/host updater does not implement generic device signing or installation. Multi-instance operation, provisioned production keys, direct device access, Meeting integration, archival, deletion, garbage collection, arbitrary version adapters, user administration and device telemetry are absent. Withdrawals retain metadata and stored bytes, but block new checks, manifests and downloads. Already-open downloads may complete. Never delete blobs manually from a live catalog.

The separately approved exact domain `https://updatehub.ygsoft.fr` is active with validated TLS and HTTP redirection. The operator manages its certificate/reverse proxy; the Hub host has a source/Host-filtered LAN gateway, not a public Docker binding. This satisfies the route's TLS gate, not general identity, backup or device-installation gates. No unrelated public host is authorized. See [DEPLOYMENT.md](DEPLOYMENT.md) before network maintenance; retain gateway streaming and audit external-proxy upload limits independently.