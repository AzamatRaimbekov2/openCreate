# partGeneration.ts — AI component doc

> AI-facing sidecar for `partGeneration.ts`. Created 2026-07-18. Keep this in sync with the code on every change.

## Purpose
Live view of a part's cited generation (extraction image or mesh), keyed by id over
the SHARED `['generation', id]` cache. It is how Assets3D reads live per-part status
without importing Cinema/Gallery — it copies Cinema's fetch-by-id precedent because
a part cites a generation by id only and the `/assets3d/:id` DTO embeds no Generation.

## What it does (for an AI reader)
- Responsibilities: fetch each cited generation by id, poll it to terminal, and (once)
  refresh the feed/balance on a real processing → terminal transition.
- Public API / exports:
  - `GENERATION_POLL_MS` — 4s poll cadence (shared with Gallery/Cinema).
  - `partPollInterval(isError, data): number | false` — PURE poll-stop guard
    (keep polling while `processing`; stop on terminal; stop on a first-poll error;
    keep polling through a blip once processing data exists).
  - `useLivePartGeneration(id: string | null)` → `useQuery` over `['generation', id]`;
    disabled on null id; invalidates `['generations']` + `['me']` once per id on the
    processing → terminal transition.
  - `useLivePartGenerations(ids: string[]): Record<string, Generation>` → batch (Assembly),
    no interval, returns only rows that have data (caller keeps `succeeded` ones).
- Inputs → Outputs: a cited generation id (or list) → `Generation` query state / lookup.
- Side effects: GET `/api/generations/:id` via `api<T>`; cache invalidation of
  `['generations']` + `['me']` on the terminal transition.

## Dependencies
- Imports / depends on: `react` (`useEffect`/`useRef`), `@tanstack/react-query`,
  `@opencreate/contracts` (`Generation`), `shared/libs/apiClient`.
- Used by: the (later) `PartGenerationCard`, `ExtractStage`/`MeshStage`, and
  `AssemblyStage` (batch resolve of mesh `mediaUrls[0]`); re-exported via `index.ts`.

## Diagram
```mermaid
flowchart LR
  ID[part.imageGenerationId / meshGenerationId] --> H[useLivePartGeneration]
  H -->|GET| API[/api/generations/:id]
  H --> C[(shared cache: generation:id)]
  H -. terminal transition .-> FB[(generations, me)]
  IDS[mesh ids] --> B[useLivePartGenerations] --> C
```

## Key decisions / gotchas
- Fetch-by-id, NOT Gallery's seed hook: a cold load has nothing in `['generation', id]`
  because the part carries only the id string.
- `partPollInterval` is extracted pure so the poll-stop guards are unit-tested with no
  WebGL / no network / no QueryClient.
- Terminal-transition refresh is gated by a `wasProcessing` latch (mutated only inside
  the effect, reset on id change) so a cold load of an already-terminal citation does
  not churn the feed/balance, and a re-roll re-arms it.
- No cross-module imports — the precedent is re-implemented; flag for a `shared/`
  extraction if it proves worth sharing.

## Commits
- _no commit yet_
