# _shell.cinema.$filmId.tsx — AI component doc

> AI-facing sidecar for `_shell.cinema.$filmId.tsx`. Created 2026-07-09. Keep this in sync with the code on every change.

## Purpose

The `/cinema/:filmId` editor route — auth-guarded, composition + the cross-module
SEAM: reads the catalog via the Generator's public `useCatalog` and passes it into
`FilmEditor` as `models`.

## What it does (for an AI reader)

- Responsibilities: route wiring, read the `filmId` param, feed the catalog in.
- Public API / exports: `Route` (TanStack file route `/_shell/cinema/$filmId`).
- Inputs → Outputs: `filmId` param + catalog → the editor page.
- Side effects: `beforeLoad: requireSession()`; `useCatalog` query.

## Dependencies

- Imports: `@tanstack/react-router` (`createFileRoute`), `requireSession` from
  `modules/Auth`, `FilmEditor` from `modules/Cinema`, `useCatalog` from `modules/Generator`.
- Used by: the generated route tree (FilmCard Link, create-film navigate).

## Diagram

```mermaid
flowchart LR
  URL[/cinema/:filmId] --> G[requireSession]
  G --> CAT[useCatalog]
  CAT --> FE[FilmEditor filmId + models]
```

## Key decisions / gotchas

- The Cinema module must NOT import Generator; the route is the seam that reads
  `useCatalog` and passes `models` down — exactly like /create feeds Gallery/Generator.
- Same `['catalog']` cache entry the composer uses — one fetch per session.

## Commits

- _no commit yet_
