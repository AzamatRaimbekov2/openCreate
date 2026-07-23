# index.ts — AI component doc

> AI-facing sidecar for `Cinema/index.ts`. Created 2026-07-09. Keep this in sync with the code on every change.

## Purpose

Public API of the CinemaStudio module — routes import ONLY from `modules/Cinema`.
Internal `model/` and `components/` files are private.

## What it does (for an AI reader)

- Responsibilities: expose exactly the two page components the routes need.
- Public API / exports: `CinemaLibrary`, `FilmEditor`.
- Inputs → Outputs: n/a (barrel).
- Side effects: none.

## Dependencies

- Imports: `./components/CinemaLibrary`, `./components/FilmEditor`.
- Used by: `routes/_shell.cinema.index.tsx`, `routes/cinema.$filmId.tsx` (standalone, no `_shell`).

## Diagram

```mermaid
flowchart LR
  C[components/*] --> IDX[index.ts] --> R[routes/_shell.cinema.index + routes/cinema.$filmId]
```

## Key decisions / gotchas

- The module has NO cross-module imports: the catalog it needs is read at the
  ROUTE (the seam, like /create) and passed into `FilmEditor` as `models`.
  Decoupling from Gallery/Generator happens through the shared query cache.

## Commits

- _no commit yet_
