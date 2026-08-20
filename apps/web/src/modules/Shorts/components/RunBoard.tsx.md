# RunBoard.tsx — AI component doc

> AI-facing sidecar for `components/RunBoard.tsx`. Created 2026-08-20. Keep in sync.

## Purpose
Per-film, per-beat status of a batch, with a retry on a single failed beat. It owns NO state: it
renders `model/boardStatus`'s derivation over the films and the shared `['generation', id]` cache.

## What it does (for an AI reader)
- Props: `{ films, models, isPending, isError, onRetryLoad }`.
- Four states: skeletons (`role="status"`), error + retry, empty, data.
- Per film: an `<article>` named after the film, a progress line, a link into `/cinema/$filmId`, and
  a chip per beat.
- Side effects: polls each live clip via `useShotGeneration`; a retry calls `useBatchRun().retryBeat`.

## The two subscriptions
- A CHIP owns the polling for its own clip (`useShotGeneration`, 4s while processing, stops at
  terminal).
- The FILM HEADER reads every clip at once for the progress line (`useShotGenerations`, no interval).
Both go through the same cache entry, so they cannot disagree and N readers cost one poll (ADR §7).
This is Cinema's own split — ShotThumb polls, PreviewPlayer reads.

## Dependencies
- Imports: `shared/ui`, `shared/libs/errorCopy`, `modules/Cinema` (`useShotGeneration`,
  `useShotGenerations`), `model/boardStatus`, `model/batchPlan` (`clipCredits`), `model/useBatchRun`.
- Used by: `ShortsStudio.tsx`.

## Key decisions / gotchas
- A beat's ordinal is its POSITION in the film, not `shot.orderIndex` — that is a real-valued sort
  key (a beat inserted between 1 and 2 is 1.5), a fine sort and a terrible label.
- A retry is a FRESH purchase (the failed attempt was refunded or never charged), so the price is on
  the control; an unknown price disables it.
- Retry is disabled while a batch runs — a fifth submit past the cap, on a total confirmed for a
  different list of beats.
- Failure copy comes from `errorCodeMessageKey`, never a provider's raw string.

## Commits
- _no commit yet_
