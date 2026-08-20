# batchApi.ts — AI model doc

> AI-facing sidecar for `model/batchApi.ts`. Created 2026-08-20. Keep in sync with the code.

## Purpose
Server state for a shorts batch: create it (free), and read it back after a reload.

## What it does (for an AI reader)
- Public API: `useCreateFilmBatch()`, `useBatchFilms(batchId)`, `useBatchFilmDetails(filmIds)`,
  `filmKey(filmId)`. Wire types are the contract's own `CreateFilmsFromTemplateBatchInput` /
  `CreateFilmsFromTemplateBatchResult` — this file declares none.
- Endpoints: `POST /api/films/from-template/batch`, `GET /api/films?batchId=…`,
  `GET /api/films/:id`.
- Side effects: seeds `['film', id]` per film from the create response; invalidates `['films']`.
  Does **not** touch `['me']` — creating charges nothing, and refreshing the balance would make the
  action look like it cost something.

## Dependencies
- Imports: `@opencreate/contracts` types, `shared/libs/apiClient`, `./variantRows`.
- Used by: `ShortsStudio.tsx`; `filmKey` is also used by `useBatchRun.ts`.

## Key decisions / gotchas
- **NO batch-status endpoint, by design** (ADR §2). Progress is derived from `shot.generationId`; a
  status route would be a second source of truth.
- **The reload chain is four SERVER hops**, not "films?batchId plus the cache" — the ADR's §2 said
  the latter and was corrected 2026-08-20. `films?batchId` → `films/:id` → `shot.generationId` →
  `generations/:id`. The shared cache makes the chain cheap once it has run (N watchers of one clip
  cost one poll); it is never the source, because client memory is empty after a reload.
- Wire types come from `@opencreate/contracts` (`CreateFilmsFromTemplateBatchInput` /
  `CreateFilmsFromTemplateBatchResult`); the local look-alikes were deleted 2026-08-20 when the
  schemas landed.
- Films come back in ROW ORDER — `films[i]` is built from `rows[i]`. That is a TESTED server
  contract (API `templates-batch.test.ts`), not an incidental property, so the board may key on row
  index. The realistic way to break it later is a refactor that reads the films back with
  `ORDER BY updatedAt`; every film in a batch shares one timestamp.
- **No partial success.** One bad row rejects the whole request and writes nothing; the 400's
  message is prose naming a key and must never be parsed. Per-row correctness is established BEFORE
  the POST by `isRowComplete` against the template's declared `variables`.
- `rows` is 1..`TEMPLATE_BATCH_MAX_ROWS` (20 — the submit bucket's number), and the route is 10/min.
- `GET /api/films?batchId=` 400s on a non-uuid rather than answering an empty list, and filters by
  OWNER as well as batch, so a leaked id addresses nothing.
- `useBatchFilmDetails` carries `staleTime: 30_000`: forty just-seeded details must not immediately
  refetch, which would fire forty requests exactly when the runner wants its rate budget.
- Cross-module contact with Cinema is through the shared query KEYS only, never an import.

## Commits
- _no commit yet_
