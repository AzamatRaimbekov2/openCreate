# batchPlan.ts — AI model doc

> AI-facing sidecar for `model/batchPlan.ts`. Created 2026-08-20. Keep in sync with the code.

## Purpose
Prices a shorts batch BEFORE anything is created and before a credit moves. ADR shorts-studio §4
makes this the load-bearing safety mechanism of the feature — it is the "explicit, itemised
confirmation step" the template-catalog ADR demanded when it rejected a "Generate all" button.

## What it does (for an AI reader)
- Responsibilities:
  - Itemise rows × GENERATED beats (free title cards are never priced).
  - Price each beat at the tier model's rate for ITS OWN duration, off the live catalog — the same
    table the API's `creditsFor` reads.
  - Make the whole total `null` if ANY beat is unpriceable (useRunBranch's law).
  - Make the total `null` if our per-beat sum DISAGREES with the server-computed tier price. Two
    prices that both claim to be real must resolve to "we don't know".
- Public API:
  - `buildBatchPlan(template, tier, rows, models) => BatchPlan`
  - `clipCredits(model, seconds) => number | null` — also used by the board's per-beat retry price
  - types `BatchPlan`, `BatchPlanItem`
- Inputs → Outputs: a `TemplateSummary` + tier + row count + `CatalogModel[]` → an itemised plan
  with `total: number | null` and `hasPriceDrift: boolean`.
- Side effects: none. Pure over plain objects; no React, no cache, no network.

## Dependencies
- Imports: types only, from `@opencreate/contracts`.
- Used by: `ShortsStudio.tsx` (the live total + the confirm), `RunBoard.tsx` (`clipCredits` for a
  single-beat retry).

## Key decisions / gotchas
- Zero rows totals **0, not null**: that is a known price of nothing. The Run control is disabled on
  an empty item list, never on an "unknown" total.
- `beatIndex` is the index into `template.beats` INCLUDING free title cards, so it matches the
  created film's shot order.
- A drifted price blanks the per-row numbers too — the itemisation must not show figures that add up
  to a total we refused to state.

## Commits
- _no commit yet_
