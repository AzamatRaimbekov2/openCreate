# compareStore.ts — Compare orchestration store

> AI-facing sidecar for `compareStore.ts`. Created 2026-07-29. Keep this in sync with the code on every change.

## Purpose

Zustand store for the `/compare` page: prompt, one `PanelResult` per contender,
and the orchestration actions (parallel fan-out, independent retry, reset,
abort).

## What it does (for an AI reader)

- Responsibilities: state + orchestration only; wire behavior lives in
  `providers.ts`.
- Public API / exports: `useCompareStore` (zustand), `CompareStore` type —
  `{ prompt, results, isGenerating, setPrompt, generateAll, retry, reset, abort }`.
- Inputs → Outputs: `generateAll()` fans out `runCompareProvider` over
  `COMPARE_PROVIDERS` via `Promise.all`, writing each panel as it settles;
  `retry(id)` re-runs one contender; `reset()` clears everything and aborts;
  `abort()` cancels in flight WITHOUT clearing results (page unmount).
- Side effects: network through providers; one module-scope `AbortController`.

## Dependencies

- Imports / depends on: `zustand`, `./providers`, `./types`.
- Used by: `routes/_shell.compare.tsx` (via module index), tested by
  `compareStore.test.ts` (providers mocked).

## Diagram

```mermaid
flowchart LR
  UI[_shell.compare.tsx] --> ST[useCompareStore]
  ST -- generateAll: 3x parallel --> RP[runCompareProvider]
  RP -- PanelResult per id --> ST
  ST -- results record --> UI
```

## Key decisions / gotchas

- **Generation logic lives in store ACTIONS, not a React hook** — the plan
  doc's "call useParallelGeneration() inside the store" is invalid React;
  plain async actions calling a service function is the idiomatic shape.
- **Race guard**: every write re-checks ITS run's `signal.aborted`, so a stale
  run (aborted by reset or a newer run) can never overwrite fresh panels —
  pinned by the "stale run cannot overwrite" test.
- `AbortController` is module-scope, not state: no render depends on it.
- `retry` does NOT flip `isGenerating` — the form stays usable and the other
  panels stay interactable (spec: independent retry).
- `Promise.all` is safe because `runCompareProvider` never rejects.

## Commits

- _no commit yet_
