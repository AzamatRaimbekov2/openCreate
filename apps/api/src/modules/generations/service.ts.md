# service.ts — AI component doc

> AI-facing sidecar for `modules/generations/service.ts`. Created 2026-07-06. Keep this in sync with the code on every change.

## Purpose
The generation lifecycle service (plan Task 10) — the core money-touching sequence of the product: charge credits at submit, call Runware, persist state transitions, download finished assets into our own storage, refund exactly once on failure. Everything else (routes, SPA) is a thin shell around this file.

## What it does (for an AI reader)
- Responsibilities: catalog-level validation (model/aspect/duration/i2v support), credit charge before any provider call, generation row persistence, sync image flow (inference → asset download → succeeded), async video flow (submit → 202; `get()` doubles as the Runware poll applying processing/succeeded/failed transitions), refund on every failure path, cursor pagination, owner-scoped reads/deletes, structured money-path logging (`generation.settle` / `generation.fail` / `provider.error` + ledger events via the passed logger).
- Public API / exports / props / endpoints:
  - `createGenerationService({ db, runware, storage, log? })` → `{ create, get, list, remove }` (`GenerationService` type). `log` is the base app logger — fallback for money events when no request logger is passed.
  - `create(userId, input, reqLog?)` → `{ dto: Generation, created: boolean }` — `created: true` = image finished synchronously (route → 201); `false` = video accepted (route → 202). Throws `ValidationError` (400), `InsufficientCreditsError` (402, from ledger), `RunwareError` (502). `reqLog` (routes pass `req.log`) stamps every money-path line of this call with the reqId.
  - `get(userId, id, reqLog?)` → `Generation`; while the row is processing it polls `runware.getResponse` and applies the transition (no background workers in MVP — the SPA's 4s polling drives progress). Rows without a `runwareTaskUuid` are never polled (submit still in flight); rows older than `STALE_PROCESSING_MS` (1h) are settled as failed + refunded instead of polling.
  - `settleStaleGenerations(db, now?, log?)` → number of settled rows — boot-time sweep called by `app.ts`; fails + refunds processing rows older than `STALE_PROCESSING_MS` so poll-abandoned generations (expired 7-day asset URLs, crashes mid-create) never hold credits forever.
  - `STALE_PROCESSING_MS` — exported staleness threshold (1 hour).
  - `list(userId, limit, cursor?)` → `{ items, nextCursor }` — newest-first; cursor is the createdAt epoch-ms of the last returned row; fetches `limit + 1` to detect the next page without COUNT.
  - `remove(userId, id)` — refuses processing rows with `ConflictError` (409/conflict — deleting mid-flight would forfeit the refund and orphan the Runware task), otherwise deletes the media file (idempotent) then the row; 404 if not owned.
  - Errors: `NotFoundError` (404/not_found), `ValidationError` (400/validation_failed), `ConflictError` (409/conflict — delete of a processing generation), `ContentBlockedError` (422/content_blocked — NSFW safety filter) — statusCode+apiCode consumed by the app.ts central error handler.
- Inputs → Outputs: `CreateGenerationInput` (contracts) → `Generation` DTO (contracts). DB rows mapped by `toDto` (JSON columns parsed, dates → ISO strings).
- Side effects (I/O, network, state): DB writes (generation rows + ledger rows inside ledger transactions), outbound Runware calls, asset downloads into `StorageProvider`, media file deletions, structured log lines on money-path transitions (settle/fail/provider error — success-guarded so racing pollers never emit duplicates; provider detail goes to logs ONLY, clients get the sanitized envelope).

## Dependencies
- Imports / depends on: `@opencreate/contracts` (input/DTO types), `db/schema` (`generation`), `credits/ledger` (`chargeCredits`/`refundCredits`/`logCharge`/`logRefund`/`MoneyLog`), `catalog/catalog` (`getModel`/`creditsFor`/`resolutionFor`), `integrations/runware/client` (type), `storage/local` (type), drizzle operators, `node:crypto`.
- Used by: `modules/generations/routes.ts` (wired in `app.ts`, Task 11); tested by `test/generations.test.ts`, `test/generations-races.test.ts` (scripted `fakeRunware`), `test/generations-money-atomicity.test.ts` (charge+insert / fail+refund atomicity) and `test/logging.test.ts` (money-path log lines).

## Diagram
```mermaid
flowchart TD
  P[POST /api/generations] --> V{catalog valid?}
  V -- no --> E400[400 validation_failed]
  V -- yes --> C[ONE tx: chargeCredits 402-guarded]
  C --> R[+ insert processing row, NO task uuid yet]
  R -- image --> I[runware.imageInference] --> S[storage.saveFromUrl] --> GTX[guarded flip → succeeded → 201]
  R -- video --> SV[runware.submitVideo] --> PU[publish runwareTaskUuid, guarded] --> A[202 processing]
  I -- throw --> RF[refund + mark failed + rethrow]
  SV -- throw --> RF
  G[GET /api/generations/:id] --> Q{processing?}
  Q -- no --> DTO[return row as-is]
  Q -- yes --> ST{older than 1h?}
  ST -- yes --> TF
  ST -- no --> HU{has task uuid?}
  HU -- no --> DTO
  HU -- yes --> PL[runware.getResponse]
  PL -- processing --> UP[update progress]
  PL -- success w/o URL --> TF
  PL -- success --> DL[download asset] --> TX[guarded flip → succeeded]
  PL -- error --> TF[failGeneration: guarded flip → failed + idempotent refund]
  B[app.ts boot] --> SW[settleStaleGenerations sweep] --> TF
```

## Key decisions / gotchas
- Charge happens BEFORE any provider call: a 402 means Runware was never contacted (asserted in tests).
- **Atomic charge+insert (review finding)**: the credit charge and the processing-row insert run in ONE `db.transaction` (`chargeCredits` in tx mode) — as two transactions, a crash between them charged the user for a row that never existed (nothing to settle or refund). The `credits.charge` audit line is emitted only after the combined commit (`logCharge`). Pinned by `test/generations-money-atomicity.test.ts`.
- **Atomic failure settlement (review finding)**: `failGeneration` runs the processing→failed flip AND the idempotent refund in ONE transaction (`refundCredits` in tx mode). The old flip-then-refund pair could crash in between, leaving a failed row whose charge was kept forever (the stale sweep only rescues 'processing' rows). Now a refund failure aborts the flip too — the row stays processing and the next poll/sweep re-runs the settlement. Fail/refund logs are emitted after the commit, gated on the flip/mutation actually applying.
- **Anti-double-spend (create/poll race)**: the processing row is inserted WITHOUT `runwareTaskUuid`; the uuid is published only after the provider call is acknowledged (video) — and images never need it. `get()` refuses to poll a row with a null uuid. This closes the window where a concurrent GET /:id polled Runware for a task it didn't know yet, misread the error as terminal, refunded, and create() then flipped the row to succeeded anyway (charge + refund = 0, asset delivered). Pinned by `test/generations-races.test.ts`.
- The image success transition is a status-guarded transaction (only processing → succeeded); if the row was settled elsewhere, the downloaded asset is discarded instead of delivered.
- Every failure path after the charge refunds; `refundCredits` is idempotent (once-per-generation guard lives in the ledger), so concurrent polls cannot double-refund.
- Poll success downloads the asset BEFORE flipping status: a failed download leaves the row processing so the next poll retries — a succeeded row always has media. Poll success WITHOUT a URL is unrecoverable (same payload forever) → `failGeneration` + refund.
- **Stuck-processing settlement**: `failGeneration` centralizes the guarded fail + idempotent refund; the get()-level reaper and the `settleStaleGenerations` boot sweep guarantee hold→settle/refund even when downloads fail permanently or the owner never polls again. Pinned by `test/generations-stale.test.ts`.
- **NSFW safety gate (spec §2/§9.4)**: `NSFWContent === true` on the image result or the video poll is checked BEFORE any storage download — flagged assets are never stored or served. Both paths settle failed + refund with `errorCode: 'content_blocked'` (persisted in the `error_code` column, surfaced in the DTO) so the SPA renders localized safety copy; the image path additionally returns the 422 `content_blocked` envelope via `ContentBlockedError`.
- Transitions out of `processing` re-read the fresh status inside a transaction because two tabs can poll the same generation concurrently.
- All reads/deletes are `(id, userId)`-scoped: another account gets 404, never data.
- **No delete while processing (review finding)**: `remove()` throws `ConflictError` (409) for processing rows. Deleting mid-flight would erase the row every failure-settlement path needs to flip+refund against (the user would silently forfeit the refund) and orphan the in-flight Runware task. Terminal rows delete normally. Pinned by `test/generations-delete.test.ts`.
- `creditsFor`'s plain Errors (missing/unsupported duration) are re-thrown as `ValidationError` — caller mistakes must be 400, not 500.
- `duration!` non-null assertion in the video branch is safe: `creditsFor` already threw if duration was undefined for a video model.
- **Money-path logging contract**: `credits.charge`/`credits.refund` are logged by the ledger (after commit), `generation.settle`/`generation.fail` here, gated on the guarded transition actually applying — log line exists ⇔ the state moved. `provider.error` carries the raw provider error (`err`/`detail`) because the HTTP envelope for unexpected failures is sanitized; logs are the only place with the real cause.

## Commits
- 681e20f feat(api): generation lifecycle — charge, runware, store, poll, refund
- 138ab61 fix(api): close create/poll race — rows are not pollable until the provider call completes
- 5d16801 fix(api): settle stuck processing generations — no-asset polls fail with refund, stale rows reaped on poll and boot
- 3b96d8c fix(api,web,contracts): respect the NSFW flag — content_blocked failure with refund, never store flagged assets, localized safety copy
- 5e8de3d feat(api): native env loading + structured logging — settle/fail/provider.error events, req.log threading
