# index.tsx — AI component doc

> AI-facing sidecar for `index.tsx`. Created 2026-07-06. Keep this in sync with the code on every change.

## Purpose
Landing route (`/`) — temporary placeholder rendering the localized headline/subtitle until `modules/Landing` ships in Task 19.

## What it does (for an AI reader)
- Responsibilities: `createFileRoute('/')` with a small presentational component; all copy via i18n keys `landing.headline` / `landing.subtitle`.
- Public API / exports: `Route`.
- Inputs → Outputs: none → centered hero headline on the paper background.
- Side effects: none.

## Dependencies
- Imports / depends on: `@tanstack/react-router`, `react-i18next`.
- Used by: `routeTree.gen.ts`; smoke-tested by `src/routes/__root.test.tsx` (asserts the EN headline via memory-history router).

## Diagram
```mermaid
flowchart LR
  URL["/"] --> R[index.tsx Route] --> H[localized hero headline]
```

## Key decisions / gotchas
- Task 19 replaces the body with `modules/Landing`'s `LandingPage`; keep this file a thin composition wrapper.
- Uses design tokens (`bg-paper`, `text-ink`, `text-ink-soft`) that activate when Task 13's `theme.css` lands — classes are inert strings until then.

## Commits
- _no commit yet_
