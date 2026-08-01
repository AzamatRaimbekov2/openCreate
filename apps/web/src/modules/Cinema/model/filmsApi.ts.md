# filmsApi.ts — AI component doc

> AI-facing sidecar for `filmsApi.ts`. Created 2026-07-09. Keep this in sync with the code on every change.

## Purpose

Server-state hooks for films: the library list, the editor's composite detail
(film + ordered shots + audio), and the create/update/delete mutations.

## What it does (for an AI reader)

- Responsibilities: own the `['films']` list and `['film', id]` detail cache; the
  detail key is the spine every shot/audio/render/storyboard mutation targets.
- Public API / exports:
  - `filmKey(id)` — the `['film', id]` cache key (shared with sibling hooks)
  - `useFilms()` → GET `/api/films` (`FilmList`)
  - `useFilm(id)` → GET `/api/films/:id` (`FilmDetail`), disabled on empty id
  - `useCreateFilm()` → POST `/api/films` (`CreateFilmInput` → `Film`)
  - `useUpdateFilm()` → PATCH `/api/films/:id` (`UpdateFilmInput` → `Film`)
  - `useDeleteFilm()` → DELETE `/api/films/:id`
- Inputs → Outputs: TanStack Query/Mutation objects.
- Side effects: network via `api<T>`; cache invalidation of `['films']` /
  `['film', id]`.

## Dependencies

- Imports: `@tanstack/react-query`, contract types, `shared/libs/apiClient`.
- Used by: `CinemaLibrary`, `NewFilmModal`, `FilmEditor`, and sibling model hooks
  (`shotsApi`, `audioApi`, `storyboardApi` import `filmKey`).

## Diagram

```mermaid
flowchart LR
  UI[Cinema UI] --> H[filmsApi hooks]
  H -->|GET/POST/PATCH/DELETE| API[/api/films]
  H --> C[(query cache: films, film:id)]
```

## Key decisions / gotchas

- `filmKey` is exported so every mutation across the module writes/invalidates
  the exact same detail entry — a typo'd key would silently strand the editor.
- `useFilm` is `enabled: filmId !== ''` so an unresolved route param never fires.

## Commits

- _no commit yet_

## Update 2026-08-02 — updates ABSORB instead of invalidating
- `useUpdateFilm` now writes the PATCH response into both caches rather than
  invalidating them. The endpoint answers with the whole `Film`, so a refetch
  would discard a row we already hold and put a visible gap between saving a
  cover and seeing it — the absorb discipline the Creator and Styles modules
  document.
- Two writes, deliberately different shapes: `['films']` replaces the row IN PLACE
  (reordering the shelf under someone who just renamed a film moves the card they
  are looking at), and `['film', id]` replaces only the composite's `film` half —
  shots and audio are not this mutation's business and are passed through by
  reference.
- An unloaded cache is left alone (`old ? … : old`), so a mutation from a surface
  that never rendered the list cannot fabricate a one-item library.
