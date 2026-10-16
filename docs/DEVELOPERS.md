<!-- File: /docs/DEVELOPERS.md | Version: 0.3.0 | Updated: 2026-10-16 -->
# Developer Integration

## Availability and Trust

Local development origin: `http://127.0.0.1:3210`. Approved deployed origin: **https://updatehub.ygsoft.fr**, now active with verified TLS and HTTP-to-HTTPS redirection; see [DEPLOYMENT.md](DEPLOYMENT.md). All examples below still use the local server. Isolated tests must not contact the public deployment or real devices. For intentional deployed use, select deployment-specific product-scoped credentials; local initialization credentials do not authenticate there.

Clients accept loopback HTTP(S) or the exact approved HTTPS origin. They reject embedded credentials, paths/query strings in the base URL, unexpected origins and HTTP redirects. Set `DUH_BASE_URL=https://updatehub.ygsoft.fr` directly for deployed use, never its HTTP redirect. Relative API URLs work unchanged through the same-origin proxy. General production signing/identity hardening and device installation remain separate gates. Do not disable certificate verification or open the Compose port beyond loopback.

The server distributes releases; a trusted platform-specific updater decides whether and how to install them. Check, manifest retrieval, download and installation are separate steps. The provided tools never execute, extract, flash or install downloaded files. SHA-256 verifies bytes, not publisher authenticity; production needs a signing strategy.

## Prerequisites and Credentials

Use Node.js 24-26 and `npm ci`, then follow [local setup](../README.md). An administrator must create the product first. The example product is `meeting-agent`; this is an independent sample product, not a Meeting integration. Adapt all identifiers and exact target fields to your project. The initial local credential grants are configured by `DUH_PRODUCT` before `npm run init`.

- Admin: create products, inspect audit history, withdraw releases. Do not use this role in publisher CI jobs.
- Publisher: create/edit/upload/validate/publish releases for explicitly granted products. No product creation or withdrawal.
- Reader: check and retrieve published manifests/artifacts for granted products. No mutation access.

Protected API operations accept bearer credentials or browser cookie sessions; `/health` and the login/session-bootstrap routes are public. Scripts keep using `Authorization: Bearer` and the unchanged publication/discovery contract. Named users, expiring/revocable API tokens, password login and cookie/CSRF rules are documented in [ADMINISTRATION.md](ADMINISTRATION.md). Cookie sessions can resume on reload; credentials never enter browser storage. Device IDs are not credentials. Never embed admin/publisher keys in devices, web bundles, repositories, manifests or artifacts; shared reader keys are not a production fleet identity solution.

Node tools resolve credentials in this order:

1. `DUH_TOKEN`: a 64-character lowercase hex token supplied through the process environment by a secret manager.
2. `DUH_TOKEN_FILE`: path to a protected text file containing only that token; surrounding whitespace is accepted. This and `DUH_TOKEN` are mutually exclusive.
3. `DUH_CREDENTIALS_FILE`, default `.local/credentials.json`: the existing credential array; select a matching publisher or reader entry for the product, never an admin fallback.

Prefer a single scoped token file for CI rather than the complete local credential array. Configure NTFS ACLs on Windows or owner-only permissions on POSIX. Do not pass tokens as command-line arguments, print environment dumps, enable request tracing, or place secret files in artifact/output directories. Use separate publisher and reader jobs/process environments. Rotation requires updating the server's protected credential file and restarting it; changing a principal ID also changes the idempotency namespace.

## Publish Through the Node CLI

Start from [examples/release-plan.json](../examples/release-plan.json). Supply your own `application.bin` and `settings.json` under the ignored `.local/artifacts` directory. No example executable or installer is provided. Paths in `files` resolve relative to the plan, not the current working directory. Absolute file paths are also accepted. File order becomes required manifest order.

PowerShell, using an externally provisioned publisher token file:

```powershell
$env:DUH_BASE_URL = 'http://127.0.0.1:3210'
$env:DUH_TOKEN_FILE = (Resolve-Path '.local/publisher.token').Path
npm run publish:release -- examples/release-plan.json
```

POSIX shell, with the same protected file:

```sh
export DUH_BASE_URL=http://127.0.0.1:3210
export DUH_TOKEN_FILE="$PWD/.local/publisher.token"
npm run publish:release -- examples/release-plan.json
```

For the original local setup, omit `DUH_TOKEN_FILE` to select the product-scoped publisher from `.local/credentials.json`. A publisher-only credential-array file can instead be selected with `DUH_CREDENTIALS_FILE`. Remove any previously configured `DUH_TOKEN` before switching to token-file mode.

The CLI creates/reuses a draft, uploads files, verifies the complete remote inventory against local bytes, writes the manifest, validates and explicitly publishes. Files must have portable unique basenames and be nonempty; a release contains 1-32 required artifacts. No fixed 64 MiB cap remains. Admins set `upload_max_bytes` (null/unlimited by default) and `upload_timeout_seconds` (default 3600, range 1-86400) in System or `GET/PUT /api/v1/admin/settings`. Publishers discover effective policy through authenticated `GET /api/v1/publishing/limits`; both supplied publishers do so and allow a 30-second client margin beyond the configured upload deadline. File-size changes apply to subsequent requests. Node uses file-backed blobs, not whole-file buffers. Uploads restart from the beginning after interruption. Metadata requests retain a 90-second client timeout, reference downloads a one-hour timeout; proxy limits, disk capacity and aggregate quotas are separate operational concerns.

Success exits 0 and prints release metadata, not credentials. Failure exits nonzero. Re-run the identical plan after a network interruption. The key is `publish-` followed by lowercase SHA-256 of compact UTF-8 JSON `[product,channel,version]`; both supplied publishers use it. Keys are scoped to the credential principal, not globally shared. Identical uploads and already-published retries are safe. A changed draft payload under the same key conflicts; changed bytes under a stored filename, extra remote files or changed published manifest order are refused. Do not delete files automatically to make a retry succeed. Correct a published release with a new version; request admin withdrawal when needed.

For CI, provision the product and a publisher-only credential before the job, inject a token file, build immutable artifacts, generate a release plan, then run the CLI and require exit 0. The job does not need an admin key or server data-volume access. Do not put secret material in release notes, plans or uploads. There is no published npm SDK/package yet: run these tools from a pinned checkout with its lockfile.

## Publish Through HTTP Directly

[examples/publish-http.ps1](../examples/publish-http.ps1) is a complete PowerShell 7 HTTP example using `Invoke-RestMethod`, not the Node CLI:

```powershell
pwsh -NoProfile -File examples/publish-http.ps1 `
  -PlanFile examples/release-plan.json `
  -TokenFile .local/publisher.token `
  -BaseUrl http://127.0.0.1:3210
```

It uses the same plan format and stable key, verifies remote inventory/order, refuses redirects and exits nonzero on errors without dumping headers or tokens. It sends `{}` for otherwise empty POST actions because PowerShell may default to form encoding. It is tested with two artifacts, identical retries and a subsequent retry by the Node CLI. PowerShell 7 is optional for the application; its integration test is skipped when `pwsh` is unavailable.

For another language, implement this versioned sequence. All paths below begin with `/api/v1`; authenticate every request and never forward credentials to a redirect or arbitrary URL:

1. `POST /publishing/releases`: JSON fields `product`, canonical `version`, `channel`, `release_notes`, `targets`. Use the example plan **without `files`**. Set `Content-Type: application/json` and an `Idempotency-Key` of 8-128 portable characters. Response is the release object, including its UUID `id`. Store this ID for retries. Same key plus different normalized draft returns 409. Same product/channel/version under a different principal/key still conflicts with the unique release identity.
2. `POST /publishing/releases/{id}/artifacts`: one multipart field named `file`, including its portable basename. Let your HTTP library generate the multipart boundary. Do not set a bare multipart Content-Type yourself. The response is the release with its current artifact array. Match filenames, sizes and SHA-256 to local files; reject missing/extra/mismatched entries.
3. `PUT /publishing/releases/{id}/manifest`: JSON `{ "schema_version": "1", "artifact_order": ["artifact-uuid-1", "artifact-uuid-2"] }`. Include every attached artifact exactly once, in required order. Obtain actual UUIDs from the upload response; these illustrative strings are not valid request IDs.
4. `POST /publishing/releases/{id}/validate`: no body, or JSON `{}`. Require `valid: true`; report the returned `errors` otherwise. Validation does not publish.
5. `POST /publishing/releases/{id}/publish`: no body, or JSON `{}`. This revalidates bytes and atomically publishes with an audit event. Publication can be replayed safely. A lost response is not proof that publication failed: inspect or retry the same release.

Do not label an empty body as JSON; either omit Content-Type or send `{}`. Metadata fields are strict: reject unknown properties rather than passing your entire build configuration. Targets require exact `device_type`, `os`, `architecture`, `hardware_revision` slugs and numeric `updater_protocol: 1`. Stable excludes prereleases; other channels remain isolated. Canonical SemVer has no build metadata. See [runtime schemas](../src/contract.ts) and the [approved contract](DECISIONS.md).

Use `GET /publishing/releases/{id}` to inspect a retry. `PATCH` replaces all draft metadata and invalidates its manifest. `DELETE /publishing/releases/{id}/artifacts/{artifact_id}` detaches a draft file only. Published metadata and bytes cannot be replaced in place. Only admins may `POST /admin/releases/{id}/withdraw`. Withdrawal is terminal and prevents new checks/manifests/downloads; an already-open download may finish.

## Check Without Downloading

Start from [examples/check-request.json](../examples/check-request.json). Set the actual installed version and all exact target values. Use a reader token, not the publisher from the preceding section:

```powershell
$env:DUH_TOKEN_FILE = (Resolve-Path '.local/reader.token').Path
npm run check:update -- examples/check-request.json
```

For machine-readable stdout without npm's script banner, invoke the script directly:

```sh
node --import tsx scripts/check.ts examples/check-request.json
```

This makes only `POST /api/v1/updates/check` and prints validated JSON. It does not fetch a manifest, create an output directory, download or install. A no-update result is `{ "update_available": false, "reason": "no_eligible_update" }`, not an error. A positive result contains `release.id`, `product`, `version`, `channel`, `release_notes` and a same-origin relative `manifest_url`. Unauthorized access is an error, never a misleading no-update result.

To download a positively selected release explicitly:

```sh
npm run download:release -- examples/check-request.json RELEASE_UUID .local/downloads
```

Replace `RELEASE_UUID` with `release.id` from your check. The download command first retrieves its immutable manifest and verifies identity, product, channel, newer version and exact compatibility against the supplied check. Every manifest artifact has an ID, portable filename, size, SHA-256, `required: true` and relative API download URL. All files are required and follow manifest order; there is no server-provided installation command.

The client stages each file under a unique temporary name, bounds received size, verifies size/hash, syncs and commits it without overwriting an existing destination. An identical verified destination is reused; a different file or symlink is refused. Temporary files from a failed transfer are removed. Previously completed verified files remain after a later file fails; the output directory is **not an atomic installation bundle**. Wait for exit 0 and verify all files before handing them to a separately trusted updater. Use a private output directory on a local filesystem supporting hard links.

This reference CLI restarts an interrupted file, rather than resuming its partial temporary bytes. Independent clients can use the API's single `Range: bytes=...` support with `If-Range` and the strong ETag, but must still verify the complete final size and SHA-256. A check never automatically triggers that request.

## Embed the Reference Client

Use [src/client.ts](../src/client.ts) inside this project or the compiled `build/src/client.js` after `npm run build`, with installed dependencies. This is a Node reference implementation, not browser/device-ready code or a separately published SDK. It imports filesystem helpers and requires the project's Node runtime. For another platform, reproduce the strict contract and integrity checks using its trusted libraries.

```javascript
import { HubClient, readClientToken } from './build/src/client.js';
import { readFileSync } from 'node:fs';

const request = JSON.parse(readFileSync('examples/check-request.json', 'utf8'));
const client = new HubClient({
  baseUrl: process.env.DUH_BASE_URL,
  token: readClientToken('reader', request.product),
});
const result = await client.check(request);
console.log(result);
```

The example intentionally stops at discovery. After a distinct user/policy decision, call `client.manifest(result.release.manifest_url, request)`, then `client.download(manifest, outputDirectory)` only for a positive result. Never derive an unrestricted filesystem path or shell command from remote metadata. `HubClient.request` is the lower-level authenticated JSON/multipart primitive used by the publisher; it does not replace response-schema validation for custom operations.

## Publish Through the Web Interface

1. Open the local URL and sign in with the scoped publisher token. An admin must already have created its permitted product.
2. Select the product, create a draft with version/channel, release notes and exact compatibility, then upload each required file.
3. Inspect sizes and hashes, choose required artifact order and save the manifest.
4. Validate explicitly, then publish. Inspect the immutable manifest and release status.
5. Sign out. Use a reader credential for a separate check and explicit download, or an admin credential for withdrawal/audit.

The same lifecycle and permission checks apply to HTTP, CLI and web UI. Reloading signs out. The System/Light/Dark preference may persist independently; it never stores credentials. UI strings are English and centralized for later localization.

## Errors and Validation

Hub self-update is a separate explicitly approved host installation path, not a generic device installer. See [SELF_UPDATE.md](SELF_UPDATE.md) for the signed three-file release, packaging CLI, host service, admin confirmation and recovery. Generic check/download clients still never install anything. The browser's individual manual download hashes an in-memory buffer; use the streaming Node reference downloader for large manual artifacts. The self-update UI stages its package on the server, not through browser download buffers.

API errors generally use `{ "error": { "code": "...", "message": "..." } }`; rate-limit/framework errors may have their own envelope. Handle non-2xx responses before treating a payload as a release or manifest.

- 400: malformed schema, unsafe filename or invalid manifest input; correct the request.
- 401/403: missing/invalid credentials or insufficient product/role grant; do not retry indefinitely.
- 404: absent or no-longer-accessible resource; recheck release status and authorization.
- 408/413: upload timed out or exceeded size; retry the complete valid file or reduce it.
- 409: idempotency, lifecycle, filename/content or version identity conflict; inspect state, do not overwrite published bytes.
- 422: release validation/integrity failure; repair the draft or publish a new version where immutable.
- 429 or transient transport/server errors: respect `Retry-After` where supplied and use bounded backoff with the same principal/key. Reconcile remote state after an ambiguous response.

Run `npm test`, `npm run build` and `npm run test:e2e` before relying on a modified integration. Tests use local isolated credentials/data and do not contact the planned domain or real devices. Browser tests use installed Edge on Windows; see [README.md](../README.md) for setup and [OPERATIONS.md](OPERATIONS.md) for backups and operational limits.