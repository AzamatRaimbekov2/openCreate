# NotFoundPage.tsx — AI component doc

> AI-facing sidecar for `NotFoundPage.tsx`. Created 2026-07-06. Keep this in sync with the code on every change.

## Purpose
Custom 404 screen — the frontend-error-ux contract's unknown-route surface. A calm standalone page on paper with a primary-styled link home, wired as the root route's `notFoundComponent`.

## What it does (for an AI reader)
- Responsibilities: render the 404 marker (decorative, `aria-hidden`), localized title/description (`errors.notFound.*`), and a TanStack `<Link to="/">` styled with the Button-primary classes.
- Public API / exports / props / endpoints: `NotFoundPage` — no props.
- Inputs → Outputs: rendered by the router on any unmatched path → full-screen 404 with a way home.
- Side effects (I/O, network, state): none.

## Dependencies
- Imports / depends on: `@tanstack/react-router` (`Link` — SPA navigation, no full page load), `react-i18next`.
- Used by: `routes/__root.tsx` (`notFoundComponent: NotFoundPage`); exported through `shared/ui/index.ts`.

## Diagram
```mermaid
flowchart LR
  BAD[unmatched path] --> ROOT[__root notFoundComponent] --> NF[NotFoundPage]
  NF --> HOME[Link to '/']
```

## Key decisions / gotchas
- Uses `Link` (not `<a>`) because `notFoundComponent` always renders inside `RouterProvider` — tests therefore mount it through a real router at a bad path (`routes/__root.test.tsx`), which also proves the wiring.
- The link intentionally mirrors `Button` primary/md classes — a navigation is a link semantically, but the single main action visually (design.md §5).
- Copy is calm and blame-free per design.md §8; standalone screens sit directly on paper (§9).

## Commits
- _no commit yet_
