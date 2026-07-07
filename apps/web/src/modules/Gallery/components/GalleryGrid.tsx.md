# GalleryGrid.tsx — AI component doc

> AI-facing sidecar for `GalleryGrid.tsx`. Created 2026-07-06. Keep this in sync with the code on every change.

## Purpose

The generations grid — the Gallery module's main surface, implementing the full
4-states rule over the infinite list plus client-side type filtering.

## What it does (for an AI reader)

- Responsibilities: list orchestration only; per-item rendering is `GenerationCard`.
- Public API / exports: `GalleryGrid` with
  `GalleryGridProps = { filter?: GalleryFilter, hasCreateCta?: boolean }`;
  `GalleryFilter = 'all' | 'image' | 'video'`.
- Inputs → Outputs:
  - loading → 8 card-shaped `Skeleton`s (static keys — no index keys).
  - error → `ErrorState` + retry (refetch).
  - empty (after filtering) → `EmptyState`, optional `/create` CTA `Link`.
  - data → `<ul>` of `GenerationCard` + ghost "Load more" while `hasNextPage`.
- Side effects: `useGenerations` infinite query (`['generations']`).

## Dependencies

- Imports: `@tanstack/react-router` (`Link`), `react-i18next`,
  `shared/ui` (`Button`, `EmptyState`, `ErrorState`, `Skeleton`),
  module model (`generationsApi`), sibling `GenerationCard`.
- Used by: `routes/create.tsx` (embedded, `hasCreateCta=false`),
  `routes/library.tsx` (with filter chips) — via `modules/Gallery` public API.

## Diagram

```mermaid
flowchart TD
  UG[useGenerations infinite 'generations'] --> S{state}
  S -->|pending| SK[8 Skeleton cards]
  S -->|error| ES[ErrorState retry]
  S -->|empty| EM[EmptyState + optional /create Link]
  S -->|data| GRID[ul GenerationCard xN] --> LM[Load more while nextCursor]
```

## Key decisions / gotchas

- Filter is CLIENT-side over loaded pages (plan Task 17) — the API has no type
  param in MVP; filtering happens after `flatMap`, so "empty" respects it.
- `hasCreateCta=false` on the create page: a CTA pointing at the page it sits
  on is noise; the EmptyState copy still explains what will appear.
- "Load more" is an explicit button (not scroll-triggered): the grid also lives
  beside the Generator form where an auto-loader would fight the page scroll.
- The CTA `Link` is styled with the primary Button classes (NotFoundPage
  convention) — semantically navigation, visually the main action.
- Stage 3 restyle (2026-07-07): loading skeletons dropped the v1 `rounded-2xl`
  soft-card silhouette — they now mirror the figure's near-flat media plate
  (Skeleton's default `rounded-sm`). Still exactly 8 `animate-pulse` nodes
  (the test counts them).

## Commits

- 9ffc310 2026-07-06 feat(web): gallery with 4-state cards and 4s polling of processing items
- cb228e3 2026-07-07 restyle(web): editorial app shell, auth, generator, gallery
