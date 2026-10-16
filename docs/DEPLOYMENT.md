<!-- File: /docs/DEPLOYMENT.md | Version: 0.3.0 | Updated: 2026-10-16 -->
# Debian Deployment

## Current Deployment

The designated host now runs frozen signed **0.2.0 / database schema 3**, installed on 2026-10-16. Release `1c186501-f1d5-4aa2-8ad3-9a6b21aa9486`, successful job `81bd728b-5373-44c5-a921-1596f26f31eb`, immutable image `sha256:b06824b4e8640a997c42b4fa2abcd27aeaa924fcb325de257024c8d05e17f176`. Its 93,423,104-byte image archive SHA-256 is `2b71c85be1431bdb30ff4b2dd80f4a09605640b2302ca201d7df785f35774665`. Never rebuild/re-tag 0.2.0, replace its artifacts or reuse withdrawn 0.1.2. Historical outcomes below remain evidence for their original versions, not a claim of a new reboot/restore test on 0.2.0.

### Accounts and Backups

**System > Users** and **System > Synology backups** are live. Existing file credentials remain compatible; no real named user/password was invented. Sign in with the existing protected `server-admin` token, create a named admin, then verify password login. API tokens remain distinct. See [ADMINISTRATION.md](ADMINISTRATION.md).

The host now has Restic 0.14.0 and rclone 1.60.1. A disposable local repository passed backup, full data integrity check and retention; rclone stdin obscuring was verified. This is not a Synology connection/restore test. No NAS destination or credential was supplied: public backup status is `available: true`, `agent_ready: true`, `settings: null`, `job: null`. Scheduling is inactive until configured. Enforce minimum SMB 3 on Synology, retain the recovery password outside the VM and certify an independent restore before relying on it.

Host policy includes `backup_key_file: /etc/device-update-hub/backup-key` and `backup_config_directory: /etc/device-update-hub`. The binary 32-byte key is root:1000 mode 0440; Compose mounts only this file read-only at `/etc/duh-backup/key`. Ignored `.local/duh-backup-key` is its operator-only ACL-protected off-host copy. It is not the NAS recovery password. Protected host configuration was copied before changes. The agent source/build is 0.2.0-compatible and serializes updates/backups. No SMB mount, web Docker socket or extra web privilege was added.

### Schema Migration Evidence

Before configuration changes, the writer was stopped and its complete schema-2 volume tar copied/fsynced/compared at `/var/lib/device-update-hub-updater/pre-0.2.0/backup/data.tar`; `host/` preserves the old configuration and `baseline.json` the old public catalog/settings. The same frozen 0.1.1 image restarted healthy before publication.

The product-scoped publisher uploaded the three signed 0.2.0 artifacts. The authenticated admin install request explicitly confirmed `0.2.0`, but old 0.1.1 web validation rejected `database_schema: 3` with 400. An authenticated operator therefore staged the exact published hashes/signature and request into the existing atomic inbox handoff, recording `/var/lib/device-update-hub-updater/migration-0.2.0.json`. The upgraded external agent independently reverified private bytes, stopped the writer, made its own full offline copy, migrated and verified exact 0.2.0/schema-3 health. No signature/schema bypass, fake schema-2 metadata, new unsigned image or application Docker access was used. Later web installs through 0.2.0 accept the approved schema union normally.

The job's 279,603,200-byte stopped schema-2 tar is `/var/lib/device-update-hub-updater/81bd728b-5373-44c5-a921-1596f26f31eb/backup/data.tar`; sibling `recovery.json` pins the prior 0.1.1/schema-2 image. Rollback must restore this complete old data before old binaries start. Configuration changes precede this job, so pre-change host policy is separately preserved under `pre-0.2.0/host`. These local copies are not off-host disaster recovery.

Post-installation checks passed: exact health with maintenance false, native TLS verification, HTTP301 to HTTPS, anonymous users401, authenticated session/users/settings/backup/update reads200, both agents ready, same existing settings and two old releases unchanged, and all three frozen 0.1.1 artifact sizes/SHA-256 hashes re-downloaded and verified. Read-only key/no Docker socket/loopback binding, active updater/Nginx and `nginx -t` passed. Operator upload setting remained 512 MiB / 3600 seconds; the product default is still unlimited. No public large upload was certified.

Final backend suite: 32 tests, 31 pass/one platform skip on Windows and Linux (POSIX passed on Linux, PowerShell passed on Windows). Ten desktop/mobile browser workflows passed; the later wrong-current-password case passed again on both viewports. Strict builds, 68-file inventories and dependency audit passed. Application image source is frozen; documentation may advance without rebuilding it.

## Authorized Target

The user explicitly authorized provisioning `DockerPVE2.lan` and installing/testing its Docker Hub and external systemd updater on 2026-10-16. The user subsequently approved the exact HTTPS origin https://updatehub.ygsoft.fr through reverse proxy **192.168.1.247**, with mandatory valid TLS and HTTP-to-HTTPS redirection. Device installation, other public routes and unrelated hosts remain unauthorized. The user reserved LAN address **192.168.1.93** and rebooted the VM; the original temporary address `192.168.1.92` is obsolete. The existing SSH host key was verified at the new address, and Docker, the updater and healthy Hub 0.1.1 resumed automatically. DNS may lag a lease/address change, so operator connections use the reserved IP with `HostKeyAlias=DockerPVE2.lan`. Never disable host-key verification to work around a name/address problem. DHCP reservation is complete; external encrypted backups and initial-password rotation remain operator actions.

Installed and exercised: Debian 12 / amd64, kernel `6.1.0-53-amd64`, Docker `29.9.1`, Docker Compose `5.6.0`, host Node `24.22.0`. [bootstrap-debian.sh](../deployment/bootstrap-debian.sh) reproduces package preparation for a fresh Debian 12 amd64 host; it upgrades packages, verifies Docker's repository key fingerprint and Node's archive checksum, but does not expose/start the application. The frozen application image uses the Dockerfile's Node 24 Debian base. OS packages and base images still need periodic maintenance; the Hub's updater does not update the host agent or OS.

## Access and Secrets

Public access is **https://updatehub.ygsoft.fr**. Docker still publishes only host `127.0.0.1:3210`; the filtered host gateway below is the only LAN entry. From the operator's Windows workstation, the active private tunnel exposes **http://127.0.0.1:3212**. Port 3211 is reserved for the isolated browser-test server; do not point tests at the deployment or enable `reuseExistingServer` to bypass that guard. The old workstation development instance on port 3210 is not the deployed server. The tunnel can close without stopping the Hub or its updater. To recreate it manually:

```sh
ssh -o StrictHostKeyChecking=yes -o HostKeyAlias=DockerPVE2.lan -N -L 127.0.0.1:3212:127.0.0.1:3210 sn8k@192.168.1.93
```

Enter the SSH password only in the terminal prompt, never chat. The deployment key is deliberately restricted against forwarding; the ordinary non-root account provides the tunnel. The application's admin/publisher/reader tokens are in ignored `.local/server-credentials.json`, protected by the operator's Windows ACL. Use the `server-admin` token in the sign-in form. Publisher/reader credentials are scoped to product `device-update-hub`, already created; they are new random credentials, not the native-development tokens. Other products require separately provisioned grants.

Secret inventory, with no secret values in source:

- `.local/duh-deploy-ed25519`: dedicated root SSH private key, ACL protected. Only its public key was manually authorized by the operator, with OpenSSH `restrict`. It is not mounted in the web container.
- `.local/duh-signing-ed25519.pem`: separate Ed25519 signing private key, ACL protected, never uploaded to Debian or included in an image. `.local/duh-signing-public.pem` is its public counterpart.
- `/etc/device-update-hub/secrets/credentials.json`: host application credential file; parent root-owned 0700, file UID/GID 1000 and 0400 so the non-root container can read its bind-mounted file without exposing the parent directory.
- `/etc/device-update-hub/updater-public.pem`: pinned public verification key, root-owned 0644. Policies and Compose input are root-owned and cannot be modified by the web process.

Store an encrypted external backup of the signing/SSH keys and application credentials before relying on this pilot. No external backup destination was supplied, so this is an outstanding operator action, not a completed backup claim. Rotate the initial server-account passwords through a trusted terminal and update protected operator storage afterward. No passwords/tokens are embedded in source or printed in deployment logs.

## Exact HTTPS Route

The original public 502 was caused by routing the external proxy to a deliberately loopback-only Docker port. Docker was not opened to the LAN. Instead, Debian Nginx `1.22.1-9+deb12u10` is enabled with [reverse-proxy-gateway.conf](../deployment/reverse-proxy-gateway.conf) installed root-owned at `/etc/nginx/conf.d/device-update-hub.conf`. It listens only on **192.168.1.93:3210**; the package's default site is disabled and no host port 80/443 listener was added. Initial installation masked the service until the default site was disabled and `nginx -t` passed.

Route: public HTTPS -> operator-managed proxy **192.168.1.247** -> HTTP **192.168.1.93:3210** -> loopback **127.0.0.1:3210**. The LAN hop is not TLS-encrypted; it relies on the trusted proxy/LAN and source allowlist. The gateway permits only that source IP and exact Host `updatehub.ygsoft.fr`. It redirects requests whose `X-Forwarded-Proto` is not `https` to the fixed HTTPS origin; forwarded headers from other machines do not bypass the source check. Gateway access logs contain time, source IP, status and method, not URI/query strings or authorization headers.

On the external proxy, the operator kept backend scheme **HTTP**, address **192.168.1.93**, port **3210**, and enabled a valid certificate for **updatehub.ygsoft.fr** plus **Force SSL**. Preserve the Host and `X-Forwarded-Proto: https` headers. Certificate renewal and external-proxy administration remain the operator's responsibility; no administrative credentials or unrelated proxy-host access were obtained. Never send bearer tokens to public HTTP or disable certificate validation.

The host gateway has no independent body-size cap (`client_max_body_size 0`), disables request/response buffering and allows up to 86400-second transfer timeouts. Application System settings remain authoritative for the Hub's upload cap/deadline. External-proxy limits/timeouts must also permit the chosen size; large public uploads have not been certified. No test publication or new self-update was triggered for this networking change.

Verified after the operator's SSL activation: public HTTP **301** to HTTPS; native certificate validation and HTTPS interface/health **200**; anonymous admin settings **401**; authenticated session/settings/update-status reads **200**, unlimited upload setting and ready agent on **0.1.1**. The public sign-in UI renders in the browser. Direct workstation LAN requests return **403**, including requests spoofing Host and forwarded HTTPS. Before Force SSL was enabled, the gateway's fallback redirect returned **308**, proving that the external proxy reached the restricted gateway.

For configuration maintenance, deploy the versioned file, validate before reloading and retain the previous known-good copy if validation fails:

```sh
nginx -t
systemctl reload nginx
systemctl status nginx
curl --fail https://updatehub.ygsoft.fr/health
```

The gateway is independent of the managed container and host-updater package. Preserve both specific-address listeners and the updater's loopback health URL through future updates. Do not rebuild/re-tag signed 0.1.1 for gateway or documentation changes. HTTPS activation does not certify production identity management, off-host recovery, all public upload sizes or generic device installers.

## Installed Layout

- `/opt/device-update-hub-agent`: trusted source/dependencies and compiled host agent, root-owned and not group/world writable. The agent is separate from the managed container.
- `/etc/device-update-hub/compose.yaml`: fully resolved, fixed merged Compose configuration, using an immutable image ID and protected credential path. No build/pull is performed when installing a package.
- `/etc/device-update-hub/updater.json` and `web-update.json`: trusted host/container policies, target `hub-server/linux/amd64/docker`, protocol 1, stable channel.
- `device-update-hub_hub-data`: persistent Docker volume mounted `/var/lib/duh`, now database schema 3 plus immutable blobs. Never remove it with `down -v`.
- `/var/lib/device-update-hub-exchange/inbox`: UID/GID 1000, 0700, only writable exchange mount in the application. `status`: root-owned 0755, mounted read-only there.
- `/var/lib/device-update-hub-updater`: root-only 0700 journals, per-job private images/metadata, synced `recovery.json`, offline `backup/data.tar`, and the active image override `deployment.json`.
- `/var/lib/device-update-hub-builds`: root-only package preparation area. The real validation exported approximately 93 MB Docker archives here; no large image was downloaded to the low-space Windows disk.
- `/etc/systemd/system/device-update-hub-updater.service`: enabled; locks via `flock`, invokes `/usr/local/bin/node`, and provides the expected filesystem/process sandbox. Docker authority is still equivalent to host root.

The web container runs as `node`, with a read-only root filesystem, dropped capabilities and no Docker socket. Public key, policies, credentials, backup key and status are read-only mounts. Native loopback access and same-origin relative URLs are preserved.

## Verified Outcomes

The initial baseline `0.1.0` was built and started on the target. Signed stable release **0.1.1** (`a13bfd3c-65b1-47a3-abf7-aa2affe8e977`) was published through the product-scoped CLI and installed through explicit admin confirmation and the real external agent. Its immutable image ID is:

```text
sha256:bf23d9dc3ee02ccc7103120d4794b7750dab536ba0820abde2ce6757b76ea088
```

Job `9769a1d0-e495-4647-b245-0663ccc83c24` progressed through verification, stop, offline backup, start and succeeded. Health verified version `0.1.1`, database schema `2`, maintenance false. The private key stayed on the operator workstation; only exact signed metadata and its detached signature were transferred to the build host.

A deliberately mislabeled baseline image was signed/published as **negative fixture 0.1.2** to exercise exact-version rejection and real restore. Job `8a58bb82-68e0-41db-9ce4-c51b0d995011` reached `rolling_back` then `rolled_back`. Previous version `0.1.1`, settings, manifest and all three downloadable artifact sizes/SHA-256 hashes were verified afterward. The negative fixture (`639ff5ed-cce5-4375-afbc-91adad4329df`) was immediately withdrawn and is no longer offered. Its version remains reserved: use `0.1.3` or a higher appropriate version for the next real release, never replace its published bytes. The current status's historical rollback is this expected negative test, not an unresolved outage.

The host was rebooted. Docker and the updater returned active automatically; the same pinned `0.1.1` container returned healthy without maintenance. Authenticated desktop/mobile browser checks through the real tunnel confirmed installed version, ready agent, no eligible update, unlimited uploads and no horizontal overflow.

Linux Node suite: 28 tests, 27 passed, one PowerShell test skipped because PowerShell is absent; POSIX permissions/symlink checks passed. Build, inventory checks and Docker construction passed. These checks do not certify power-loss recovery, all interruption points, off-host disaster recovery, public exposure or generic device installers. Interrupted-job fail-closed behavior remains covered by isolated tests, not a deliberate power cut on this host.

## Operations

Use the protected image override after any managed update, not `up --build` against the original baseline. On the host, as an authorized operator:

```sh
systemctl status device-update-hub-updater
journalctl -u device-update-hub-updater --no-pager -n 50
docker compose -p device-update-hub -f /etc/device-update-hub/compose.yaml -f /var/lib/device-update-hub-updater/deployment.json ps
curl --fail http://127.0.0.1:3210/health
```

For backup/restore, stop the writer and copy the entire volume, preserving blobs and SQLite sidecars, plus separately protected credentials; see [OPERATIONS.md](OPERATIONS.md). Self-update backups are local operational rollback copies, not off-host disaster recovery. Monitor free disk, backup retention and growing immutable artifacts; this pilot has no aggregate quota or garbage collection. About 25 GB remained after both validation jobs. No automatic cleanup of completed private job backups or Docker images is enabled.

Source documentation may advance after the frozen signed `0.1.1` image; do not rebuild/re-tag that release as different bytes. A future functional change must become a new signed version. Follow [SELF_UPDATE.md](SELF_UPDATE.md) for packaging, publisher grants, exact target and explicit confirmation; never edit a published manifest or add package-provided commands.