# theme.css — AI component doc

> AI-facing sidecar for `theme.css`. Created 2026-07-06. Keep this in sync with the code on every change.

## Purpose
The app's ONLY stylesheet (frontend law): Tailwind v4 entry plus the "Light Editorial" (v2) design tokens declared via `@theme`. Canonical token table with roles/use-when/avoid-when lives in `docs/frontend/design.md` §2–§3.

## What it does (for an AI reader)
- Responsibilities: `@import 'tailwindcss'`; declare the 8 color tokens (`cream`, `ink`, `ink-soft`, `vermillion`, `sand`, `media`, `success`, `danger`) + the 2 font tokens (`--font-display` = Fraunces Variable serif, `--font-sans` = Space Grotesk Variable — overrides Tailwind's default sans); set the base canvas (`body { bg-cream font-sans text-ink antialiased }`).
- Public API / exports / props / endpoints: Tailwind utilities generated from the tokens (`bg-cream`, `text-ink`, `ring-vermillion`, `bg-sand`, `bg-media`, `font-display`, …).
- Inputs → Outputs: imported once by `src/main.tsx` (after the @fontsource @font-face imports) → utilities available app-wide.
- Side effects (I/O, network, state): global CSS.

## Dependencies
- Imports / depends on: `tailwindcss` (v4, via `@tailwindcss/vite`); font families registered by `@fontsource-variable/fraunces` + `@fontsource-variable/space-grotesk` (imported in `main.tsx`).
- Used by: `src/main.tsx` (single import); every component through utility classes.

## Diagram
```mermaid
flowchart LR
  FONTS[@fontsource variable fonts] --> MAIN[main.tsx]
  TW[tailwindcss v4] --> THEME[theme.css @theme tokens] --> UTIL[bg-cream / text-ink / ring-vermillion / font-display …] --> UI[shared/ui + modules]
  MAIN --> THEME
```

## Key decisions / gotchas
- v2 rename (editorial redesign): `paper→cream`, `accent→vermillion`, `accent-soft→sand`; `--radius-card` dropped (unused). Any `bg-paper`/`*-accent` utility is now a DEAD token — grep before reviving.
- Raw hex is banned in components — tokens only; in-between grays/hairlines are opacity modifiers (`border-ink/15`, `bg-ink/10`), not new tokens. Exception: `ShowcasePoster` art palettes (content, not chrome) documented in design.md §5.
- Vermillion is never body-text: ≥18px/bold, active states, stamps, or non-text only (contrast 3.7:1 on cream). `danger` (#b3261e, 6.1:1) exists so failure text never borrows the accent.
- `--color-media` is the only dark surface allowed (behind image/video previews) — the app stays light so the user's output is the hero.
- Fraunces/Space Grotesk ship no Cyrillic: `--font-display` falls back to Georgia serif, `--font-sans` to system-ui for RU.
- New tokens require a repeated product need + a design.md §2 entry in the same change.

## Commits
- 51d80a6 2026-07-06 feat(web): paper&ink design system, shared ui kit, error-ux surfaces
- 3305c12 2026-07-07 restyle(web): editorial design system — tokens, fonts, ui kit
