# rendersApi.ts — AI component doc

> AI-facing sidecar for `rendersApi.ts`. Created 2026-07-09. Keep this in sync with the code on every change.

## Purpose

Kick an ffmpeg export render and poll it to a terminal state. A render spends our
CPU, not a provider invoice — no ledger, no refund, just a status machine.

## What it does (for an AI reader)

- Responsibilities: start a render, seed its poll cache, poll every ~2s until
  `succeeded`/`failed`.
- Public API / exports:
  - `renderKey(id)` — `['render', id]` cache key
  - `useCreateRender()` → POST `/api/films/:filmId/renders` (202 → `FilmRender`)
  - `useRender(filmId, renderId | null)` → GET `…/renders/:renderId` (polled)
- Inputs → Outputs: mutation takes `filmId`; the query takes `filmId` + nullable
  `renderId` (null disables it).
- Side effects: network; the create seeds `['render', id]` so the bar has data
  on the first frame.

## Dependencies

- Imports: `@tanstack/react-query`, `FilmRender`, `shared/libs/apiClient`.
- Used by: `RenderBar`.

## Diagram

```mermaid
flowchart LR
  RB[RenderBar] --> CR[useCreateRender] -->|POST 202| API[/renders]
  CR --> C[(cache: render:id)]
  RB --> UR[useRender poll 2s] -->|GET| API
  UR -->|status != processing| STOP[stop interval]
```

## Key decisions / gotchas

- The interval stops on any terminal state AND on a first-poll error (no data
  yet) — a failing endpoint is never hammered every 2s.
- On `succeeded`, `mediaUrl` is a served `/media/<id>.mp4` — the download link.

## Commits

- _no commit yet_
