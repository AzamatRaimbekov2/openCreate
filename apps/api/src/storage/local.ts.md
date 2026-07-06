# local.ts — local media StorageProvider

> AI-facing sidecar for `local.ts`. Created 2026-07-06. Keep this in sync with the code on every change.

## Purpose
Owns finished generation assets on local disk. Runware URLs expire after 7 days, so successful generations are immediately downloaded into `STORAGE_DIR` and the SPA gets a stable `/media/<key>.<ext>` path instead.

## What it does (for an AI reader)
- Responsibilities: download-by-URL to disk, idempotent delete, expose the absolute serving root.
- Public API / exports:
  - `StorageProvider` type — the seam for a future S3/R2 provider (post-MVP) without touching callers.
  - `createLocalStorage(dir)` →
    - `saveFromUrl(url, key, ext)` → fetches `url`, streams to `<root>/<key>.<ext>`, returns `"/media/<key>.<ext>"` (goes into `generation.mediaJson`); throws `asset download failed: <status>` on non-2xx or missing body.
    - `remove(key, ext)` → idempotent unlink (missing file is fine — already cleaned up or never downloaded).
    - `dir` → absolute root that app.ts serves at `/media/*` via `@fastify/static`.
- Inputs → Outputs: provider URL + key/ext → file on disk + public path.
- Side effects: `mkdir -p` of the root at creation; network fetch; file writes/deletes.

## Dependencies
- Imports / depends on: `node:fs`, `node:fs/promises`, `node:path`, `node:stream` (+ `node:stream/web` type), `node:stream/promises`.
- Used by: `src/app.ts` (`deps.storage.dir` → static root), `src/index.ts` (real instance), `modules/generations/service.ts` (Task 10), `test/helpers/build-test-app.ts` (mkdtemp instance).

## Diagram
```mermaid
flowchart LR
  RW[(Runware asset URL, expires 7d)] -->|fetch stream| L[local.ts saveFromUrl]
  L -->|write| D[(STORAGE_DIR/key.ext)]
  L -->|/media/key.ext| G[generation.mediaJson]
  D -->|@fastify/static /media/*| SPA[web SPA]
```

## Key decisions / gotchas
- `resolve(dir)` up front: config allows relative paths (`./data/media`) but `@fastify/static` requires an absolute root — normalized once here so app.ts can trust `storage.dir`.
- Streams via `pipeline(Readable.fromWeb(...), createWriteStream(...))` — videos are tens of MB, never buffered in memory. The `as unknown as NodeReadableStream<Uint8Array>` cast bridges DOM vs node:stream/web ReadableStream nominal types (structurally identical).
- Keys are our own generation UUIDs, not user input; traversal safety on reads is @fastify/static's job.

## Commits
- 6c4e94f feat(api): local media storage with /media serving
