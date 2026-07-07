# CostLabel.tsx — AI component doc

> AI-facing sidecar for `CostLabel.tsx`. Created 2026-07-06. Keep this in sync with the code on every change.

## Purpose

Live credit-price readout of the Generator draft ("≈ 35 credits"), shown next
to the submit button so choice and cost are always visible together.

## What it does (for an AI reader)

- Responsibilities: format the current price with localized pluralization. Pure presentational.
- Public API / exports: `CostLabel` with `CostLabelProps = { credits: number | null }`.
- Inputs → Outputs: `credits` from `selectCostCredits` → localized text; `null` → renders nothing.
- Side effects: none.

## Dependencies

- Imports: `react-i18next`.
- Used by: `components/GeneratorPanel.tsx`.

## Diagram

```mermaid
flowchart LR
  ST[generatorStore] --> SEL[selectCostCredits] --> CL[CostLabel] --> TXT["≈ n credit(s) via generator.cost plurals"]
```

## Key decisions / gotchas

- Pluralized through i18next `count` (`cost_one/cost_other` en;
  `cost_one/few/many/other` ru) — never string-concatenated.
- Renders nothing for `null` (no model/duration resolved) — a wrong or empty
  number would undermine the product's honest-pricing promise.
- v3 stage-3 restyle: the line is a mono weight-400 numeral in SPECIMEN GREEN
  (`text-2xl font-normal text-glow-green`) in the sheet footer — the price
  belongs to the green Generate pill beside it, and the landing's price index
  already speaks in the same glow-green numeral voice; weight 400 obeys the
  ceiling law. Text content and `data-testid="cost-label"` untouched.

## Commits

- 2b7dd54 2026-07-06 feat(web): generator module — prompt, model/aspect/duration, i2v upload, cost
- cb228e3 2026-07-07 restyle(web): editorial app shell, auth, generator, gallery
- 252ab38 2026-07-07 restyle(web): terminal design system — cosmic void tokens, jetbrains mono, specimen pills + docs
- e5888a4 2026-07-07 restyle(web): terminal app shell, auth, generator, gallery, credits
