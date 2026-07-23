# shotGeneration.ts — AI component doc

> AI-facing sidecar for `shotGeneration.ts`. Created 2026-07-09. Keep this in sync with the code on every change.

## Purpose

The bridge from a timeline shot to the existing generation lifecycle: create a
clip, link it to the shot, then poll it. Decouples from Gallery/Generator through
the shared query cache — never through an import.

## What it does (for an AI reader)

- Responsibilities:
  - `useGenerateShotClip()`: POST `/api/generations` (body from
    `composeShotClipInput`) → PATCH `…/shots/:id` with the new `generationId`.
    RETRIES the submit on transient failures only (`shouldRetrySubmit`).
  - `useShotGeneration(generationId | null)`: poll GET `/api/generations/:id`
    every 4s while `processing`.
  - `shouldRetrySubmit(failureCount, error)`: pure retry predicate — true for the
    transient allowlist (`rate_limited`/`provider_error`/`internal_error`), any
    5xx, and non-envelope network throws; false for the four actionable/terminal
    codes and after `MAX_SUBMIT_RETRIES` (2).
- Public API / exports: `useGenerateShotClip`, `useShotGeneration`,
  `useShotGenerations`, `shouldRetrySubmit`, `GenerateShotClipVars` type.
- Inputs → Outputs: mutation vars `{filmId, shot, model, filmAspect}` → `Generation`.
- Side effects: network; on success seeds `['generation', id]`, prepends to the
  shared `['generations']` infinite list, invalidates `['film', id]` and `['me']`
  (charge-at-submit refreshed the balance).

## Dependencies

- Imports: `@tanstack/react-query`, contract types, `shared/libs/apiClient`,
  `composeShotClipInput`, `filmKey`.
- Used by: `ShotInspector` (Generate), `ShotThumb`/`PreviewPlayer`
  (`useShotGeneration` for status + media).

## Diagram

```mermaid
flowchart TD
  G[useGenerateShotClip] -->|1 POST /generations| GEN[Generation]
  G -->|2 PATCH shot.generationId| SHOT[Shot linked]
  G -->|3 seed + invalidate| C[(generation:id, generations, film:id, me)]
  SG[useShotGeneration] -->|poll 4s while processing| GEN
```

## Key decisions / gotchas

- Shares the `['generation', id]` and `['generations']` keys with the Gallery —
  the shot's clip also shows up in the create/library feed, with zero imports.
- Poll stops on terminal state and on a first-poll error (no data) — a stuck/failed
  endpoint is not hammered.
- Retry is SUBMIT-only and ALLOWLIST-based: a settled `failed` generation is
  never re-run here (that is the poll's terminal state, surfaced by
  `useShotFailureToast`, not a mutation). content_blocked etc. never retry — a
  retry would re-cost or is pointless. `shouldRetrySubmit` is exported and unit-
  tested directly, so the policy is pinned without driving a real mutation.

## Commits

- _no commit yet_
