# PriceTable.tsx — AI component doc

> AI-facing sidecar for `PriceTable.tsx`. Created 2026-07-06, restyled 2026-07-07
> (stage-2 "The index" treatment). Keep this in sync with the code on every change.

## Purpose
"The index" — the honest price comparison as an editorial index table: hairline
rules (no card), serif display numerals, the vermillion openCreate column and
the verification date as a footnote. Our price per use case vs ONE named
competitor item per row.

## What it does (for an AI reader)
- Responsibilities: `SectionHeading` (kicker "The index" + h2 "Honest price
  comparison") and the `PRICE_COMPARISON_ROWS` `<table>`: uppercase micro-label
  column headers (ours in vermillion), `border-ink/15` row hairlines, serif
  `font-display` price numerals (ours vermillion 2xl/3xl bold, competitor same
  size in ink), model/competitor notes in ink-soft, `caption-bottom` footnote.
- Public API / exports: `PriceTable`, `PriceTableProps`
  (`ordinal?: string`, default `'01'` — landing passes `'02'`; data comes from
  the module's own `pricingData`).
- Inputs → Outputs: static rows + i18n keys `landing.price.*` → section with
  SectionHeading + captioned table; prices printed via `formatUsd`.
- Side effects: none.

## Dependencies
- Imports / depends on: `react-i18next`, `../model/pricingData`,
  `./SectionHeading`.
- Used by: `LandingPage.tsx` (section 02) and `routes/_shell.pricing.tsx`
  (opening 01 section above the per-model credit table).

## Diagram
```mermaid
flowchart LR
  Data[pricingData rows] --> PT[PriceTable.tsx]
  I18N[landing.price.* keys EN/RU] --> PT
  SH[SectionHeading] --> PT
  PT --> LP[LandingPage ordinal 02]
  PT --> PR[/pricing route ordinal 01/]
```

## Key decisions / gotchas
- The `<caption>` (verification date) is deliberately the table's accessible
  name — `caption-bottom` only moves it visually to the footnote position; the
  test still queries `getByRole('table', { name: /verified july 2026/i })`.
- Vermillion carries the "us" column: large serif numerals are the sanctioned
  ≥18px/bold use; the 11px column header is the recorded index-table exception
  (design.md §2/§8). Small model notes stay ink-soft — never vermillion.
- No blanket "cheapest" wording anywhere — copy rules allow only the four
  approved claims plus per-row comparisons.
- `min-w-[36rem]` + `overflow-x-auto` keeps three readable columns on phones
  without horizontal page scroll (brief QA #5).

## Commits
- f2fe5d7 2026-07-06 feat(web): landing with honest price comparison (EN/RU)
- (pending) restyle(web): editorial landing + pricing
