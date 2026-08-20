# useBatchRun.ts — AI model doc

> AI-facing sidecar for `model/useBatchRun.ts`. Created 2026-08-20. Keep in sync with the code.

## Purpose
The batch runner: `useRunBranch` reshaped from sequential to PARALLEL-WITH-A-CAP. It submits one
generation per payable beat of every film in a batch, polls each to a terminal state, and records
per-item outcomes. This is the largest single spend in the product (ADR shorts-studio: ~1,400
credits for ten shorts × four beats on standard).

## What it does (for an AI reader)
- Public API:
  - `useBatchRun() => { start(films, models), cancel(), retryBeat(shot, model, filmAspect), state }`
  - `useIsBatchRunning()`, `useBatchRunItems()`, `useBatchRunItem(shotId)`
  - `collectBatchWork(films)`, `MAX_IN_FLIGHT` (4), `resetBatchRun()` (test seam)
  - types `BatchWorkItem`, `BatchRunState`, `BatchRunStatus`
- Store shape: `{ status: 'idle'|'running'|'done'|'cancelled', items: BatchRunItem[] }` in a
  MODULE-level zustand store.
- Side effects: `POST /api/generations`, `PATCH /api/films/:id/shots/:shotId`, polls
  `GET /api/generations/:id`; writes `['generation', id]`, patches `['film', id]`, invalidates
  `['me']` per submit.

## The rules, all of them money rules
- **Cap of 4**, and a worker owns its beat from submit through to a terminal poll. Releasing the slot
  early is the obvious speed-up and the wrong trade: 40 clips × ~15 req/min (one poll per 4s) is
  ~600 req/min against a 300/min per-IP wall, so an "optimised" runner does not make a large batch
  faster — it makes the whole app fail, on every route, for as long as the batch runs. Holding the
  slot bounds polling at ~60 req/min and submits at 4 against the 20/min route limit. Throughput is
  the cheaper thing to lose (owner call 2026-08-20, confirming ADR §7's strict reading). The
  arithmetic is written at the `pollToTerminal` call site, which is where anyone changing this will
  actually be standing.
- **Never re-submit a beat that already cites a generation** — that is a double charge.
- **Per-item failure never aborts the batch** (ExtractStage's discipline). The runner refunds
  NOTHING: `generations.create` already refunded internally before the error arrived.
- **Cancel is a token outside React**, checked BEFORE every submit. A re-render must not be what
  stops a run that spends money. Its presence is also the one-run-at-a-time guard.
- **Retry allowlist imported from Cinema** (`shouldRetrySubmit`) — never re-try `content_blocked`,
  `validation_failed` or `insufficient_credits`.

## Dependencies
- Imports: `modules/Cinema` (`composeShotClipInput`, `shouldRetrySubmit`), `shared/libs/apiClient`,
  `./boardStatus`, `./batchApi` (`filmKey`), zustand, TanStack Query.
- Used by: `ShortsStudio.tsx` (start/cancel), `RunBoard.tsx` (per-beat overlay + retry).

## Key decisions / gotchas
- The store is module-level, not React state (a run outlives the board's mount) and not a document
  store (a poll ticking is not a document edit — autosave must not fire).
- `linkShot` ABSORBS the PATCH into `['film', id]` instead of invalidating: four workers
  invalidating one composite would refetch it four times mid-run.
- `retryBeat` is refused while a batch runs — it would be a fifth submit past the cap, against a
  total confirmed for a different list of beats.
- `finish()` will not overwrite a `cancelled` status with `done` when the pool drains.

## Commits
- _no commit yet_
