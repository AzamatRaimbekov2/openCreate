# SectionHeading.tsx — AI component doc

> AI-facing sidecar for `SectionHeading.tsx`. Created 2026-07-07 (stage-2 editorial
> landing/pricing rebuild). Keep this in sync with the code on every change.

## Purpose
The one section header used by every landing/pricing section, in the v3 terminal
voice: ghost mono ordinal (01/02/…) + optional quiet lowercase mono kicker + mono
weight-400 `<h2>` title over the standard white/10 hairline rule (design.md v3 §3-4).

## What it does (for an AI reader)
- Responsibilities: render the decorative ordinal (`aria-hidden`, `text-white/10`),
  the optional kicker (`text-xs text-mist-dim`) and the section `<h2>`
  (`text-3xl font-normal text-white`); close with the `border-white/10` hairline.
- Public API / exports / props / endpoints: `SectionHeading`,
  `SectionHeadingProps` (`ordinal: string`, `title: string`, `kicker?: string`).
- Inputs → Outputs: localized strings in → static header JSX out. No state.
- Side effects (I/O, network, state): none.

## Dependencies
- Imports / depends on: none (pure presentational).
- Used by: `ShowcaseSpread.tsx`, `PriceTable.tsx`, `HowItWorks.tsx`,
  `FaqClaims.tsx`, `routes/_shell.pricing.tsx`.

## Diagram
```mermaid
flowchart LR
  I18N[section title / kicker strings] --> SH[SectionHeading.tsx]
  SH --> Sections[Showcase / PriceTable / HowItWorks / FaqClaims / pricing route]
```

## Key decisions / gotchas
- The ordinal and kicker sit OUTSIDE the `<h2>`: `LandingPage.test.tsx` asserts
  the exact `textContent` of every level-2 heading, and `scripts/prerender.mjs`
  greps `Honest price comparison` — the h2 text must stay the verbatim i18n title.
- v3 restyle intent: the h2 obeys the heading law (mono 30px weight 400, no
  uppercase, no `md:` upscaling — hierarchy comes from white-vs-mist color and
  spacing, not size/weight escalation); the ghost ordinal is `text-white/10` so
  it reads as a faint terminal line mark on the void, not a printed numeral.
- Exported through `modules/Landing` index because the /pricing route reuses it
  for its "Credits per model" section (same index treatment, brief §Page-by-page).

## Commits
- 2f56573 2026-07-07 restyle(web): editorial landing + pricing
- (pending) restyle(web): terminal design system — cosmic void tokens, jetbrains mono, specimen pills + docs
