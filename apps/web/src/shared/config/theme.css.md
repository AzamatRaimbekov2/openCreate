# theme.css — AI component doc

> AI-facing sidecar for `theme.css`. Created 2026-07-06. Keep this in sync with the code on every change.

## Purpose
The app's ONLY stylesheet (frontend law): Tailwind v4 entry plus the "Paper & Ink" design tokens declared via `@theme`. Canonical token table with roles/use-when/avoid-when lives in `docs/frontend/design.md` §2.

## What it does (for an AI reader)
- Responsibilities: `@import 'tailwindcss'`; declare the 8 color tokens (`paper`, `ink`, `ink-soft`, `accent`, `accent-soft`, `media`, `success`, `danger`) + `--radius-card`; set the base canvas (`body { bg-paper text-ink antialiased }`).
- Public API / exports / props / endpoints: Tailwind utilities generated from the tokens (`bg-paper`, `text-ink`, `ring-accent`, `bg-media`, …).
- Inputs → Outputs: imported once by `src/main.tsx` → utilities available app-wide.
- Side effects (I/O, network, state): global CSS.

## Dependencies
- Imports / depends on: `tailwindcss` (v4, via `@tailwindcss/vite`).
- Used by: `src/main.tsx` (single import); every component through utility classes.

## Diagram
```mermaid
flowchart LR
  TW[tailwindcss v4] --> THEME[theme.css @theme tokens] --> UTIL[bg-paper / text-ink / ring-accent …] --> UI[shared/ui + modules]
```

## Key decisions / gotchas
- Raw hex is banned in components — tokens only; in-between grays are opacity modifiers (`border-ink/10`, `bg-ink/5`), not new tokens (design.md §2/§9).
- `--color-media` is the only dark surface allowed (behind image/video previews) — the app stays light so the user's output is the hero.
- New tokens require a repeated product need + a design.md §2 entry in the same change.

## Commits
- 51d80a6 2026-07-06 feat(web): paper&ink design system, shared ui kit, error-ux surfaces
