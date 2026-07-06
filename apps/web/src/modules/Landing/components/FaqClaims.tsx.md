# FaqClaims.tsx — AI component doc

> AI-facing sidecar for `FaqClaims.tsx`. Created 2026-07-06. Keep this in sync with the code on every change.

## Purpose
Landing section 4: the claims FAQ, restricted to the three honest topics the
plan's copy rules allow — credits never expire (+ no subscription required),
what a credit is, which models are behind the product.

## What it does (for an AI reader)
- Responsibilities: h2 (`landing.faq.title`) + `<ul>` of three Q&A cards
  (h3 question, p answer).
- Public API / exports: `FaqClaims` (no props).
- Inputs → Outputs: `ITEMS` const (`expire`/`credit`/`models`, doubling as
  i18n key segments `landing.faq.items.<id>.*`) → stacked white cards.
- Side effects: none.

## Dependencies
- Imports / depends on: `react-i18next`.
- Used by: `LandingPage.tsx` (section 4).

## Diagram
```mermaid
flowchart LR
  I18N[landing.faq.* keys EN/RU] --> FAQ[FaqClaims.tsx] --> LP[LandingPage section 4]
```

## Key decisions / gotchas
- Plain stacked Q&A instead of a disclosure/accordion — three short answers
  don't earn extra interaction cost (and stay findable with in-page search).
- The fourth approved claim («No subscription required») lives inside the
  `expire` answer — the FAQ must NOT grow topics beyond the approved claims.

## Commits
- _pending: feat(web): landing with honest price comparison (EN/RU)_
