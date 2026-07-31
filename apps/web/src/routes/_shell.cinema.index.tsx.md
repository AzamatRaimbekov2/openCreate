# _shell.cinema.index.tsx — AI component doc

> AI-facing sidecar for `_shell.cinema.index.tsx`. Created 2026-07-09. Keep this in sync with the code on every change.

## Purpose

The `/cinema` library route — auth-guarded, composition-only. Lays out the
full-bleed canvas and renders `CinemaLibrary`.

## What it does (for an AI reader)

- Responsibilities: route wiring + page canvas; no business logic.
- Public API / exports: `Route` (TanStack file route `/_shell/cinema/`).
- Inputs → Outputs: n/a → the library page.
- Side effects: `beforeLoad: requireSession()` (bounces signed-out visitors).

## Dependencies

- Imports: `@tanstack/react-router` (`createFileRoute`), `requireSession` from
  `modules/Auth`, `CinemaLibrary` from `modules/Cinema`.
- Used by: the generated route tree (nav Link `to="/cinema"`).

## Diagram

```mermaid
flowchart LR
  URL[/cinema] --> G[requireSession] --> P[main → CinemaLibrary]
```

## Key decisions / gotchas

- Named `.index.tsx` (not `_shell.cinema.tsx`) so TanStack nests `/cinema` and
  `/cinema/$filmId` under an auto-created parent Outlet — no manual layout route.

## Commits

- _no commit yet_

## Update 2026-07-31 — reads the style registry for the New-film modal
- Adds `useStyles()` (from `modules/Styles`) and passes `styles.data?.items ?? []`
  to `CinemaLibrary`, which forwards it to `FilmSettingsModal` — the film's DEFAULT
  style, which since ADR style-studio D5 may be a style the user wrote.
- The route is the seam because `modules/Cinema` must not import `modules/Styles`;
  this mirrors what `cinema.$filmId.tsx` does for the editor.
- Shares the `['styles']` cache entry with `/styles` and the film editor.
