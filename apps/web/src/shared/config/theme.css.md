# theme.css — AI component doc

> AI-facing sidecar for `theme.css`. Created 2026-07-06. Keep this in sync with the code on every change.

## Purpose
The app's ONLY stylesheet (frontend law): Tailwind v4 entry plus the v3 "Bioluminescent Terminal" design tokens declared via `@theme`. Canonical token table with roles/use-when/avoid-when lives in `docs/frontend/design.md` §2–§3.

## What it does (for an AI reader)
- Responsibilities: `@import 'tailwindcss'`; declare the surface ladder (`void` #06051d, `abyss` #0f1c36, `steel` #1d293d, `ridge` #314062), text tokens (`mist` #cad5e2, `mist-dim` #90a1b9, `portal` #63b3ed), the specimen pill triad bases (`specimen-green` #004f3b, `specimen-amber` #733e0a, `specimen-red` #8b0836), the bright triad glows (`glow-green` #00bc7d, `glow-amber` #f0b100, `glow-red` #ff2056), the pill foregrounds (`lumen-amber` #fefce8, `lumen-red` #fff1f2); font tokens (`--font-mono` = JetBrains Mono — THE typeface and the body default, `--font-sans` = DM Sans, sparing); `--shadow-pill` (the ONE allowed shadow); `--animate-skeleton` + `skeleton-step` keyframes (stepped solid surface pulse); base canvas (`html { background: void }`, `body { bg-void font-mono text-mist antialiased }`).
- Public API / exports / props / endpoints: Tailwind utilities generated from the tokens (`bg-void`, `bg-steel`, `bg-ridge`, `text-mist`, `text-portal`, `bg-specimen-green/20`, `text-glow-red`, `shadow-pill`, `animate-skeleton`, …).
- Inputs → Outputs: imported once by `src/main.tsx` (after the @fontsource @font-face imports) → utilities available app-wide.
- Side effects (I/O, network, state): global CSS.

## Dependencies
- Imports / depends on: `tailwindcss` (v4, via `@tailwindcss/vite`); font families registered by `@fontsource/jetbrains-mono` + `@fontsource/dm-sans` (imported in `main.tsx`).
- Used by: `src/main.tsx` (single import); every component through utility classes.

## Diagram
```mermaid
flowchart LR
  FONTS[@fontsource jetbrains-mono + dm-sans] --> MAIN[main.tsx]
  TW[tailwindcss v4] --> THEME[theme.css @theme tokens] --> UTIL[bg-void / text-mist / bg-specimen-green/20 / shadow-pill / animate-skeleton …] --> UI[shared/ui + modules]
  MAIN --> THEME
```

## Key decisions / gotchas
- v3 rename (terminal redesign): every v2 token is DEAD — `cream`, `ink`, `ink-soft`, `vermillion`, `sand`, `media`, `success`, `danger`, `font-display` no longer exist. Grep before reviving; nothing in `src/` references them (verified in the restyle).
- **NO GRADIENTS anywhere** — hard owner rule. The page background is flat `#06051d`; the skeleton pulse is `steps(1, end)` over solid background-colors, never a shimmer sweep.
- Elevation is a surface COLOR STEP (void → abyss → steel → ridge), never a shadow; `--shadow-pill` (soft double) is the single exception, allowed ONLY on specimen pills.
- The triad is a closed system: green = create/submit, amber = explore/browse/processing, red = auth-exit/destructive/failed. Status mapping: processing=amber, succeeded=green, failed=red. Pills render as `bg-specimen-*/20 border-white/10` + bright text — no solid opaque fills.
- Portal blue is the only chromatic accent in prose (links, wordmark dot, ordinals); triad glows never carry prose.
- Hairlines/washes are `white/N` opacity modifiers (`border-white/10`, `bg-white/5`) — no gray tokens.
- Weight ceiling: nothing above `font-medium` (500); headings are `font-normal` (400) at the 30px scale, no uppercase transforms.
- JetBrains Mono ships real Cyrillic (imported); DM Sans does not — RU `font-sans` prose falls back to system sans by design.
- New tokens require a repeated product need + a design.md §2 entry in the same change.

## Commits
- 51d80a6 2026-07-06 feat(web): paper&ink design system, shared ui kit, error-ux surfaces
- 3305c12 2026-07-07 restyle(web): editorial design system — tokens, fonts, ui kit
- (pending) restyle(web): terminal design system — cosmic void tokens, jetbrains mono, specimen pills + docs
