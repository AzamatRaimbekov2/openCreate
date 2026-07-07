# ShowcaseSpread.tsx — AI component doc

> AI-facing sidecar for `ShowcaseSpread.tsx`. Created 2026-07-07 (stage-2 editorial
> landing rebuild). Keep this in sync with the code on every change.

## Purpose
The landing's "Selected works" magazine spread: six poster-grade `ShowcasePoster`
art cards in an asymmetric 12-col grid with honest editorial figure captions —
the section that replaces the v1 gradient-placeholder strip the product owner
rejected (brief §Showcase art, design.md §5).

## What it does (for an AI reader)
- Responsibilities: section header (`SectionHeading` 01 + "sample styles"
  kicker), 12-col spread (spans 7+5 / 4-tall-9:16+4+4 / full-width 21:9),
  per-card `<figure>` with slice-cropped poster, hover print-lift
  (≤1deg tilt + 1.5% scale, `motion-safe` only), and `<figcaption>`:
  `fig. 0N — “title” · Model (provider)` + neutral "sample style" `Badge` chip.
  Exactly ONE card (sea) carries the glow-amber `video · 5s` chip overlay with
  a decorative play glyph.
- Public API / exports: `ShowcaseSpread` (no props).
- Inputs → Outputs: i18n strings (`landing.showcase.*`) + static
  `SHOWCASE_ITEMS` art-direction data → section JSX. No state, no data fetching.
- Side effects: none.

## Dependencies
- Imports / depends on: `react-i18next`, `shared/ui` (`Badge`, `ShowcasePoster`,
  `ShowcasePalette`), `./SectionHeading`.
- Used by: `LandingPage.tsx` (second block, between Hero and PriceTable).

## Diagram
```mermaid
flowchart LR
  ART[shared/ui ShowcasePoster 6 palettes] --> Spread[ShowcaseSpread.tsx]
  I18N[landing.showcase.* EN/RU] --> Spread
  Spread -- fig. 01..06 captions + sample stamps --> Landing[LandingPage]
```

## Key decisions / gotchas
- Honesty rules: every caption carries the localized "sample style" stamp and a
  REAL catalog model (Flash = FLUX schnell, Studio = FLUX dev, Cinema = Wan 2.7)
  — we never imply the posters are user generations. Model names are proper
  nouns and deliberately not translated.
- v3 restyle: the video marker is the Badge mono-caption-chip voice in
  glow-amber (amber = explore/highlight in the triad) on a `bg-void/80` backing
  (a bare chip would drown on busy art); poster windows moved to `rounded-lg`
  (the 8px card radius). The poster ART itself is still the v2 editorial set —
  Stage 2 replaces it with blue-violet duotone specimens (design.md v3 §5).
- fig numbers come from reading-order position (`index + 1`, padStart 2) but
  keys stay the palette ids — index-as-key is still banned.
- The art is `aria-hidden` (inside ShowcasePoster); screen readers hear only
  the honest caption. Tests: `ShowcaseSpread.test.tsx` (6 figures, 1 video
  marker, distinct palettes, honest model labels).

## Commits
- 2f56573 2026-07-07 restyle(web): editorial landing + pricing
- 252ab38 2026-07-07 restyle(web): terminal design system — cosmic void tokens, jetbrains mono, specimen pills + docs
