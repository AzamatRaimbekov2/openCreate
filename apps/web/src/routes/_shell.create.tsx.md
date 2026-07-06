# _shell.create.tsx — AI component doc

> AI-facing sidecar for `_shell.create.tsx` (formerly `create.tsx`). Created 2026-07-06. Keep this in sync with the code on every change.

## Purpose

The `/create` route: auth-guarded generation screen composing the Generator
panel and the live Gallery column. Lives under the pathless `_shell` layout
since Task 18, so it renders inside the AppShell chrome (URL unchanged).

## What it does (for an AI reader)

- Responsibilities: route registration (`/_shell/create` → URL `/create`),
  `beforeLoad` auth guard, page layout. Composition only — no business logic
  (modular-architecture rule for routes/).
- Public API / exports: `Route` (TanStack file-route).
- Inputs → Outputs: navigation to `/create` → guard check → two-column render
  (GeneratorPanel left, live `GalleryGrid hasCreateCta=false` right; mobile stacks);
  signed-out → thrown redirect to `/login`.
- Side effects: `requireSession()` performs a session fetch in `beforeLoad`.

## Dependencies

- Imports: `@tanstack/react-router`, `react-i18next`, `modules/Auth` (`requireSession`),
  `modules/Generator` (`GeneratorPanel`), `modules/Gallery` (`GalleryGrid`).
- Used by: `routeTree.gen.ts` (generated, as child of `_shell.tsx`), `main.tsx` router.

## Diagram

```mermaid
flowchart LR
  NAV[/create/] --> BL[beforeLoad requireSession]
  BL -->|signed in| SH[_shell AppShell chrome]
  SH --> PG[CreatePage grid lg:26rem+1fr]
  PG --> GEN[GeneratorPanel]
  PG --> GAL[GalleryGrid hasCreateCta=false]
  GEN -.submit prepends card via 'generations' cache.-> GAL
  BL -->|signed out| RD[redirect /login]
```

## Key decisions / gotchas

- Guard in `beforeLoad`, not in the component: no flash of the private screen,
  no wasted catalog fetch for signed-out visitors.
- Task 18 moved the file under the `_shell` pathless layout: the shell now owns
  the page canvas (`bg-paper` + min-height + header), so the old
  `min-h-screen bg-paper` wrapper was removed from this screen — keeping it
  would double the viewport height under the header.

## Commits

- 2b7dd54 2026-07-06 feat(web): generator module — prompt, model/aspect/duration, i2v upload, cost
- 9ffc310 2026-07-06 feat(web): gallery with 4-state cards and 4s polling of processing items (adds the gallery column)
- _pending: feat(web): app shell with nav, balance, language switch (moved under `_shell` layout)_
