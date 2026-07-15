# SoulCharacters.tsx — AI component doc

> AI-facing sidecar for `SoulCharacters.tsx`. Created 2026-07-12. Keep this in sync with the code on every change.

## Purpose

The user's own characters as a grid of cover plates leading into the soul card —
the 4 UI states over the shared `['entities']` query, filtered to the entities that
actually have a soul.

## What it does (for an AI reader)

- Responsibilities: loading (6 square skeletons) → error + retry → empty state →
  a grid of `Link` plates; show the primary photo, or a "no portrait yet" note.
- Public API / props: none (it owns its own query).
- Inputs → Outputs: `useSoulCharacters()` → tiles linking to `/soul/$entityId`.
- Side effects: `GET /api/entities` (shared cache with `/entities`).

## Dependencies

- Imports: `react-i18next`, `@tanstack/react-router` (`Link`), `shared/ui` (`Card`,
  `EmptyState`, `ErrorState`, `Skeleton`), `../model/soulApi`.
- Used by: `SoulStudio`.

## Diagram

```mermaid
flowchart TD
  Q[useSoulCharacters] -->|isPending| SK[6 skeleton plates rounded-2xl]
  Q -->|isError| ER[ErrorState + retry]
  Q -->|empty| EM["EmptyState — build one, it is free"]
  Q -->|data| GR["grid of Card surface=well plates"]
  GR --> L["Link → /soul/$entityId"]
```

## Key decisions / gotchas

- A cover photo is CONTENT: the tile is a recessed `well` Card, never frosted glass
  (design.md §3.5, same reasoning as `GenerationCard`). A face the user paid 26
  credits for must read as a face.
- The `Link` sits INSIDE the Card (Card renders a `<div>`), so the plate owns the
  hover lift and the link owns an INSET focus ring — an outset ring would be
  clipped by `overflow-hidden`.
- "No portrait yet" is the NORMAL first state: creation is free, the photo is the
  paid act. The empty state says so rather than nagging.
- The filter is a `select` on the SHARED `['entities']` cache — `/soul` and
  `/entities` cost one fetch between them, and no module imports the other.

## Commits

- _no commit yet_
