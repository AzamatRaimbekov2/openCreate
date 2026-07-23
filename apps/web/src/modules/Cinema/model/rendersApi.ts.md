# rendersApi.ts — AI component doc

> AI-facing sidecar for `rendersApi.ts`. Created 2026-07-09. Keep this in sync with the code on every change.

## Purpose

Kick an ffmpeg export render and poll it to a terminal state. A render spends our
CPU, not a provider invoice — no ledger, no refund, just a status machine.

## What it does (for an AI reader)

- Responsibilities: start a render, seed its poll cache, invalidate the film
  detail (which carries `latestRender`), and poll every ~2s until `succeeded`/
  `failed` or the poll gives up.
- Public API / exports:
  - `renderKey(id)` — `['render', id]` cache key
  - `MAX_POLL_FAILURES` — consecutive failed polls before we stop (3)
  - `renderPollInterval(status, failureCount)` — PURE interval decision
  - `useCreateRender()` → POST `/api/films/:filmId/renders` (202 → `FilmRender`;
    409 `conflict` when the film is already exporting)
  - `useRender(filmId, renderId | null)` → GET `…/renders/:renderId` (polled)
- Inputs → Outputs: mutation takes `filmId`; the query takes `filmId` + nullable
  `renderId` (null disables it).
- Side effects: network; the create seeds `['render', id]` so the bar has data on
  the first frame AND invalidates `['film', filmId]` so a reload/second tab sees
  the render that was just started.

## Dependencies

- Imports: `@tanstack/react-query`, `FilmRender`, `shared/libs/apiClient`,
  `./filmsApi` (`filmKey`).
- Used by: `FilmEditor` (owns the kick-off + the poll; `RenderBar` is pure).

## Diagram

```mermaid
flowchart LR
  FE[FilmEditor] --> CR[useCreateRender] -->|POST 202| API[/renders]
  CR --> C[(cache: render:id)]
  CR --> INV[invalidate film:id → latestRender]
  FE --> UR[useRender poll 2s] -->|GET| API
  UR -->|terminal status| STOP[stop interval]
  UR -->|3 consecutive failures| GIVEUP[stop + isError → RenderBar 'lost' state]
```

## Key decisions / gotchas

- **The poll wedge (fixed 2026-07-21).** The old guard was
  `isError && data === undefined`, but `useCreateRender` SEEDS the cache with the
  202 body — so `data` was never undefined in the tab that started the render and
  the guard could not fire. The interval ran forever against a failing endpoint,
  and because the seeded row still said `processing`, the strip showed
  "processing 0%" with no error and no retry while Export stayed removed from the
  ⋯ menu. The user was locked out of their own film with nothing admitting it.
  `renderPollInterval` now counts CONSECUTIVE failures
  (`query.state.fetchFailureCount`, which TanStack resets on any success), so the
  seed is irrelevant and one network blip still costs nothing.
- **Callers MUST read `isError`.** A poll we have given up on is a state the user
  has to be told about, not a spinner that quietly never resolves.
- On `succeeded`, `mediaUrl` is a served `/media/<id>.mp4` — the download link.
- `renderPollInterval` is exported PURE so the wedge is testable with no
  QueryClient and no network.

## Commits

- _no commit yet (render persistence + poll-wedge fix 2026-07-21)_
