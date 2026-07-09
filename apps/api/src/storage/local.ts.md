# local.ts — local media StorageProvider

> AI-facing sidecar for `local.ts`. Created 2026-07-06. Keep this in sync with the code on every change.

## Purpose
Owns finished generation assets on local disk. Runware URLs expire after 7 days, so successful generations are immediately downloaded into `STORAGE_DIR` and the SPA gets a stable `/media/<key>.<ext>` path instead.

## What it does (for an AI reader)
- Responsibilities: download-by-URL to disk (behind an SSRF host allowlist, a whole-download timeout and a streaming byte cap), idempotent delete, expose the absolute serving root.
- Public API / exports:
  - `StorageProvider` type — the seam for a future S3/R2 provider (post-MVP) without touching callers.
  - `StorageLimits` type + `DEFAULT_ASSET_FETCH_TIMEOUT_MS` (120s) + `DEFAULT_ASSET_MAX_BYTES` (512MB) — download-hardening knobs and their safe defaults.
  - `createLocalStorage(dir, allowedHosts = ['runware.ai'], limits = {})` →
    - `saveFromUrl(url, key, ext)` → SSRF gate first (see below), then fetches `url` with `redirect: 'manual'`, streams to `<root>/<key>.<ext>` under the byte cap and abort deadline, returns `"/media/<key>.<ext>"` (goes into `generation.mediaJson`); throws `asset url/host not allowed…` before any fetch for a forbidden host or non-https scheme, `asset redirect not allowed: <status>` on any 30x answer, `asset download failed: <status>` on non-2xx or missing body, `asset too large: exceeded <n> bytes` when the streamed byte count passes `maxBytes`, `asset download timed out after <n>ms` when the deadline fires (headers OR body phase). On any mid-stream failure the partial file is unlinked — a truncated asset is never left behind under `/media/*`.
    - `remove(key, ext)` → idempotent unlink (missing file is fine — already cleaned up or never downloaded).
    - `localPath(key, ext)` → absolute on-disk path `<root>/<key>.<ext>`, no I/O (CinemaStudio render reads shot media and writes the finished mp4 through this). Safe to call for a not-yet-existing path (the render output path is computed before ffmpeg writes it).
    - `dir` → absolute root that app.ts serves at `/media/*` via `@fastify/static`.
- Inputs → Outputs: provider URL + key/ext → file on disk + public path.
- Side effects: `mkdir -p` of the root at creation; network fetch (allowlisted hosts only); file writes/deletes.
- SSRF gate (review finding): the fetched URL comes from a PROVIDER RESPONSE, not our code — a compromised/misbehaving payload could point the server-side fetch at internal targets (169.254.169.254 metadata, localhost admin ports) and exfiltrate the answer into public `/media/*`. `assertAllowedAssetUrl` is default-deny: scheme must be exactly `https:` (rejects `file:`/`data:`/`ftp:` and downgraded `http:` in one check — on-path attackers must never see or answer the request), then hostname must equal an allowlist entry or be a true subdomain (`vm.runware.ai` → `runware.ai`); plain suffix matching would let `evilrunware.ai` through. Unparseable URLs are rejected too. Allowlist comes from `config.assetHostAllowlist` (`ASSET_HOST_ALLOWLIST`, default `runware.ai`) via index.ts; the constructor default keeps forgetful callers safe. Pinned by `test/storage.test.ts` ("saveFromUrl host allowlist").
- Redirect hop closed (second review finding): the gate only ever validates the FIRST url, and fetch's default `redirect: 'follow'` would let a single 30x on an allowlisted host (open redirect / hostile provider payload) re-point the request anywhere AFTER the gate passed. `saveFromUrl` therefore fetches with `redirect: 'manual'` and treats ANY 30x as an error (`asset redirect not allowed: <status>`) — provider asset URLs are direct links, so a redirect is hostile by definition; no re-vetting of `Location` hops. Residual (documented, not implemented for the MVP): DNS-rebinding — a resolver-level private/link-local IP check would be the next layer if the threat model grows.
- Download limits (third review finding): one `AbortController` deadline spans the WHOLE download — its signal is shared by `fetch` AND the body `pipeline`, because undici resolves `fetch()` at headers and a fast-answering provider could still stream forever. The byte cap is a `Transform` counter between network and disk (not one byte past the cap is written; `Content-Length` is deliberately ignored — headers can lie). Limits come from `config.assetFetchTimeoutMs`/`assetMaxBytes` (`ASSET_FETCH_TIMEOUT_MS`/`ASSET_MAX_BYTES`) via index.ts; the exported defaults keep forgetful callers safe. A `timedOut` flag disambiguates the deadline from the manual abort issued on cap/stream errors, so callers get stable messages. Pinned by `test/storage.test.ts` ("saveFromUrl download limits").

## Dependencies
- Imports / depends on: `node:fs`, `node:fs/promises`, `node:path`, `node:stream` (+ `node:stream/web` type), `node:stream/promises`.
- Used by: `src/app.ts` (`deps.storage.dir` → static root), `src/index.ts` (real instance), `modules/generations/service.ts` (Task 10), `test/helpers/build-test-app.ts` (mkdtemp instance).

## Diagram
```mermaid
flowchart LR
  RW[(Runware asset URL, expires 7d)] --> GATE{https AND host on ASSET_HOST_ALLOWLIST?}
  GATE -- no --> X[throw, never fetched]
  GATE -- yes -->|fetch redirect:manual + abort deadline| L[local.ts saveFromUrl]
  L -- 30x answer --> XR[throw, Location never fetched]
  L -- byte cap tripped or timeout --> XT[abort + unlink partial + throw]
  L -->|write via byte-counting Transform| D[(STORAGE_DIR/key.ext)]
  L -->|/media/key.ext| G[generation.mediaJson]
  D -->|@fastify/static /media/*| SPA[web SPA]
```

## Key decisions / gotchas
- `resolve(dir)` up front: config allows relative paths (`./data/media`) but `@fastify/static` requires an absolute root — normalized once here so app.ts can trust `storage.dir`.
- Streams via `pipeline(Readable.fromWeb(...), createWriteStream(...))` — videos are tens of MB, never buffered in memory. The `as unknown as NodeReadableStream<Uint8Array>` cast bridges DOM vs node:stream/web ReadableStream nominal types (structurally identical).
- Keys are our own generation UUIDs, not user input; traversal safety on reads is @fastify/static's job.

## Commits
- 6c4e94f feat(api): local media storage with /media serving
- a7e4cd9 fix(api): ssrf allowlist, cursor tiebreaker, poll throttle — assertAllowedAssetUrl gate + allowedHosts param
- fc3a0f5 fix(api): ssrf redirect bypass — redirect: 'manual' + any-30x error + https-only scheme
- de61e59 feat(api): db-level refund-once index + asset download limits — StorageLimits (fetchTimeoutMs/maxBytes), whole-download abort deadline, streaming byte cap, partial-file unlink
