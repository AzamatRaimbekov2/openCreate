# _shell.shorts.index.tsx — AI route doc

> AI-facing sidecar for `routes/_shell.shorts.index.tsx`. Created 2026-08-20. Keep in sync.

## Purpose
The `/shorts` screen — the BATCH surface over the shorts shelf. Auth-guarded, composition only.

## What it does (for an AI reader)
- `beforeLoad: requireSession()`; renders `<ShortsStudio>` inside the shell's full-bleed main.
- Reads the CATALOG via `useCatalog()` (modules/Generator) and passes it as `models` — the
  established route seam, the reason the Shorts module never fetches a price list.
- Owns the BATCH ID as a search param (`?batch=…`), written with `replace: true`.

## Key decisions / gotchas
- The search param IS the reload story (ADR §2): the board is rebuilt from the id plus the shared
  `['generation', id]` cache, so a closed tab loses nothing already submitted.
- `validateSearch` is hand-written rather than schema-driven: one optional opaque id, where
  "not a non-empty string" simply means "no batch" — the honest reading of a truncated URL.
- An empty catalog is passed through as `[]`, which the studio reads as "no price yet", never "free".

## Commits
- _no commit yet_
