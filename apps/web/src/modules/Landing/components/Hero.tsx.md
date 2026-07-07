# Hero.tsx — AI component doc

> AI-facing sidecar for `Hero.tsx`. Created 2026-07-06, rebuilt 2026-07-07
> (stage-2 editorial redesign). Keep this in sync with the code on every change.

## Purpose
Terminal landing hero (v3): quiet mono kicker, whisper-weight mono display
headline (`clamp(1.875rem,5vw,3.75rem)` at weight 400 — the v3 signature) with
exactly ONE portal-blue accent word, the three approved claims in one line, and
the GREEN specimen-pill CTA + portal text link to `/pricing`. Stage 2 adds the
ASCII-sphere hero visual on top of this type system.

## What it does (for an AI reader)
- Responsibilities: kicker (`landing.kicker`, plain lowercase mono), h1 headline
  with the locale-driven accent word (`landing.headlineAccent`) wrapped in an
  inline `<em class="text-portal not-italic">`, claims line (`images · videos ·
  expire` joined with mid-dots), green specimen-pill CTA (mirrors Button
  primary/lg) and the portal "See the price index" text link.
- Public API / exports: `Hero`, `HeroProps` (`ctaTo: '/create' | '/login'`).
- Inputs → Outputs: `ctaTo` (decided by the route from the session — the module
  never reads auth itself) → hero JSX.
- Side effects: none. The v1 placeholder thumbnail strip was REMOVED — showcase
  art now lives in `ShowcaseSpread.tsx`.

## Dependencies
- Imports / depends on: `@tanstack/react-router` (`Link`), `react-i18next`.
- Used by: `LandingPage.tsx` (first section).

## Diagram
```mermaid
flowchart LR
  Route[routes/index.tsx session] -- ctaTo --> Hero[Hero.tsx]
  I18N[landing.kicker / headline / headlineAccent / claims / cta / secondaryCta] --> Hero
  Hero -- CTA Link --> Dest[/create or /login/]
  Hero -- text link --> Pricing[/pricing/]
```

## Key decisions / gotchas
- **Accent-word split**: the headline stays ONE i18n string; the accent word is
  found via `indexOf` and wrapped inline, so (a) the h1 accessible name remains
  the verbatim headline (e2e asserts it exactly — inline `<em>` does not change
  browser accname), and (b) `scripts/prerender.mjs` still finds the contiguous
  `"Pay pennies, not plans."` — which is why the EN accent ("video") MUST live
  in the first sentence. RU accent is «копейки» (no prerender constraint).
  A locale without a matching accent renders the headline whole (defensive).
- Copy rules: ONLY the approved claims; tests assert the absence of
  "cheapest"/"cheaper than every…".
- v3 restyle intent: the headline clamp tops out at 3.75rem (v2's 7rem serif
  would overflow in wide mono glyphs); the accent `<em>` is `not-italic` because
  only upright mono faces ship (a synthesized oblique fakes a face we don't
  have); CTA = green tint because "start creating" is THE create action in the
  triad taxonomy; secondary links are portal blue — the only chromatic prose
  accent (design.md v3 §2).

## Commits
- f2fe5d7 2026-07-06 feat(web): landing with honest price comparison (EN/RU)
- 2f56573 2026-07-07 restyle(web): editorial landing + pricing
- (pending) restyle(web): terminal design system — cosmic void tokens, jetbrains mono, specimen pills + docs
