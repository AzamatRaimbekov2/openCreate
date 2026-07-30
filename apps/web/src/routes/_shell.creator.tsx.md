# _shell.creator.tsx — AI component doc

> AI-facing sidecar for `_shell.creator.tsx`. Created 2026-07-30. Keep this in sync with the code on every change.

## Purpose
The `/creator` screen's route: openCreator inside the AppShell chrome, auth-guarded, giving the workbench a fixed viewport-height canvas. Composition only.

## What it does (for an AI reader)
- Responsibilities: register the route under the `_shell` layout; bounce signed-out visitors in `beforeLoad`; provide the full-height page canvas the chat scroller needs.
- Public API / exports / props / endpoints: `Route` (the only allowed export). No endpoints.
- Inputs → Outputs: a `/creator` navigation → the guarded `CreatorWorkbench`.
- Side effects (I/O, network, state): `requireSession()` may redirect before any private UI mounts.

## Dependencies
- Imports / depends on: `@tanstack/react-router` (`createFileRoute`), `modules/Auth` (`requireSession`), `modules/Creator` (`CreatorWorkbench`).
- Used by: the generated `routeTree.gen.ts`; linked from `shared/ui/AppShell` (`nav.creator`).

## Diagram
```mermaid
flowchart LR
  NAV["AppShell → /creator"] --> BL["beforeLoad: requireSession()"]
  BL -->|signed out| LOGIN["/login redirect"]
  BL -->|signed in| MAIN["main h-[calc(100dvh-4rem)]"]
  MAIN --> WB["CreatorWorkbench (modules/Creator)"]
```

## Key decisions / gotchas
- **`h-[calc(100dvh-4rem)]` with `overflow-hidden`, the `/create` precedent.** `dvh` not `vh`: mobile Safari's `vh` includes the retracted URL bar. The height is FIXED rather than grown by content because that is what makes the transcript its own scroller and keeps the composer pinned; a `min-h` version would let the PAGE scroll instead, and a chat whose input you must scroll down to reach is not a chat.
- **The `4rem` is knowingly ~20px too big, and should not be "fixed".** The compact v3.1 header is 44px (`py-1.5` + a 32px control row), so this leaves a small gap under the composer. Tightening it to `2.75rem` would reclaim those pixels and risk pushing the composer under the fold as soon as the header's own `flex-wrap` takes a second row. Known caveat in both directions: on a viewport narrow enough to wrap the ten nav links, a fixed-height page cannot scroll to reveal what the taller header pushed down — the same caveat `/create` carries. A real fix belongs in `AppShell` (a shared header-height token, or a layout that measures it), not in per-route arithmetic.
- **Only `Route` is exported.** The page component stays private or the router plugin cannot code-split the screen (`autoCodeSplitting`).
- **No business logic here.** Which conversation is open and where a message is posted live in `modules/Creator/CreatorWorkbench` — a route that made those decisions could not be tested without booting a router.
- **`routeTree.gen.ts` is generated**: the route entry appears there automatically on any vite/vitest run. It is a shared file — when committing alongside other in-flight route work, stage only the hunks for this route.

## Commits
- _no commit yet_
