# shotsApi.ts — AI component doc

> AI-facing sidecar for `shotsApi.ts`. Created 2026-07-09. Keep this in sync with the code on every change.

## Purpose

Server-state mutations for the timeline's shots: add, update, delete and reorder,
each keeping the film's `['film', id]` detail cache truthful.

## What it does (for an AI reader)

- Responsibilities: write shots; leave the detail cache consistent after each.
- Public API / exports:
  - `useAddShot()` → POST `/api/films/:filmId/shots` (`CreateShotInput` → `Shot`)
  - `useUpdateShot()` → PATCH `…/shots/:shotId` (`UpdateShotInput` → `Shot`)
  - `useDeleteShot()` → DELETE `…/shots/:shotId`
  - `useReorderShots()` → POST `…/shots/reorder` (`{shotIds}` → `{items: Shot[]}`)
- Inputs → Outputs: variables carry `filmId` (+ `shotId`/`input`/`shotIds`).
- Side effects: network; invalidate `['film', filmId]` — except reorder, which
  `setQueryData`-patches the detail's `shots` with the server's re-spaced list.

## Dependencies

- Imports: `@tanstack/react-query`, contract types, `shared/libs/apiClient`,
  `filmKey` from `./filmsApi`.
- Used by: `Timeline` (add/delete/reorder/title card), `ShotInspector` (update).

## Diagram

```mermaid
flowchart LR
  T[Timeline / ShotInspector] --> H[shotsApi hooks]
  H -->|POST/PATCH/DELETE| API[/api/films/:id/shots]
  H -->|invalidate or patch| C[(cache: film:id → shots)]
```

## Key decisions / gotchas

- Reorder sends the FULL ordered id list; the server owns `orderIndex` (real-valued
  midpoint spacing) so the client never computes indices. The returned list is
  written straight into cache for an instant re-sequence between button presses.

## Commits

- _no commit yet_
