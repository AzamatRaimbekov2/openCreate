# main.tsx — AI component doc

> AI-facing sidecar for `main.tsx`. Created 2026-07-06. Keep this in sync with the code on every change.

## Purpose
SPA entry point: builds the typed TanStack Router from the generated route tree and mounts the React app under `#root` in StrictMode.

## What it does (for an AI reader)
- Responsibilities: load the self-hosted variable fonts (Fraunces opsz + italic, Space Grotesk) BEFORE the stylesheet, `createRouter({ routeTree })`, register the router type via `declare module '@tanstack/react-router'` (declaration merging — the one sanctioned `interface` use), guard against a missing `#root`, render `<RouterProvider>`.
- Public API / exports: none (entry module referenced from `index.html`).
- Inputs → Outputs: `routeTree.gen.ts` + DOM `#root` → mounted app.
- Side effects: DOM render; module-level router construction; global @font-face + stylesheet registration.

## Dependencies
- Imports / depends on: `react`, `react-dom/client`, `@tanstack/react-router`, `./routeTree.gen` (generated), `@fontsource-variable/fraunces` (`opsz.css` + `opsz-italic.css` — display serif with optical sizing and the italic accent face), `@fontsource-variable/space-grotesk/index.css` (UI grotesk; explicit `.css` path because the bare package entry has no type declarations and tsc TS2882 rejects untyped side-effect imports), `shared/config/theme.css` (Tailwind v4 entry + "Light Editorial" tokens — the app's only stylesheet, imported once here, AFTER the fonts so the `--font-*` tokens resolve).
- Used by: `index.html` (`<script type="module" src="/src/main.tsx">`).

## Diagram
```mermaid
flowchart LR
  HTML[index.html #root] --> MAIN[main.tsx]
  GEN[routeTree.gen.ts] --> MAIN
  MAIN --> RP[RouterProvider StrictMode] --> APP[routes/*]
```

## Key decisions / gotchas
- `Register` augmentation makes every `<Link to>`/`navigate` statically typed against real routes; tests build their own router instances with memory history instead of importing this module.
- `routeTree.gen.ts` is produced by the vite plugin on dev/build/test start — run any script once before `tsc` if the file is missing.
- Fonts are self-hosted via @fontsource (no external requests, `font-display: swap`). Fraunces/Space Grotesk ship NO Cyrillic subsets — RU text renders in the Georgia/system fallbacks declared by the `--font-*` tokens (accepted in design.md v2 §3).

## Commits
- c987d5f 2026-07-06 feat(web): vite scaffold, tanstack router, i18n, providers
- 51d80a6 2026-07-06 feat(web): paper&ink design system, shared ui kit, error-ux surfaces
- 3305c12 2026-07-07 restyle(web): editorial design system — tokens, fonts, ui kit (fonts imported before theme.css; explicit space-grotesk .css path for TS2882)
