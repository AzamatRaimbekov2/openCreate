# _shell.soul.index.tsx — AI component doc

> AI-facing sidecar for `_shell.soul.index.tsx`. Created 2026-07-12. Keep this in sync with the code on every change.

## Purpose

The `/soul` screen — AI Soul Studio. Auth-guarded route, composition only: the Soul
module owns the draft, the pickers and the mutations; the route owns the canvas.

## What it does (for an AI reader)

- Responsibilities: guard the session (`requireSession`), lay out the TIGHT
  workbench canvas (`px-4 py-4 xl:px-6` — the `/cinema/$filmId` posture), render
  `SoulStudio`.
- Public API / exports: `Route` (TanStack file route `/_shell/soul/`).
- Side effects: `beforeLoad` redirect for signed-out visitors.

## Dependencies

- Imports: `@tanstack/react-router`, `modules/Auth` (`requireSession`),
  `modules/Soul` (`SoulStudio`).
- Used by: the generated route tree (`src/routeTree.gen.ts`).

## Diagram

```mermaid
flowchart LR
  URL["/soul"] --> G[beforeLoad: requireSession]
  G --> M["main canvas px-4 py-4 (workbench)"]
  M --> S["SoulStudio: rail | stage | builder + fixed dock"]
```

## Key decisions / gotchas

- NO catalog is read here: nothing on this screen costs credits. The prices — and
  therefore the catalog — live on the soul card, where the paid actions are.
- The `py-4` canvas is load-bearing: its 16px padding + the 44px app bar is the
  `100svh-76px` the studio column subtracts. Change the padding and the desktop
  workbench either clips or leaves a gap. Same math as the cinema editor route.

## Commits

- _no commit yet_
