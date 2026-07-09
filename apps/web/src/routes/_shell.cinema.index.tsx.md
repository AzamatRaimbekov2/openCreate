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
