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

## Commits

- 2b7dd54 2026-07-06 feat(web): generator module — prompt, model/aspect/duration, i2v upload, cost
