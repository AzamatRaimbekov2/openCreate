# ModelCreditTable.tsx — AI component doc

> AI-facing sidecar for `ModelCreditTable.tsx`. Created 2026-07-06. Keep this in sync with the code on every change.

## Purpose
Full per-model credit table for the `/pricing` page: every catalog model with
its honest provider label, localized type, credits (flat / per duration) and
the ≈ USD conversion at $0.01/credit.

## What it does (for an AI reader)
- Responsibilities: render `models` as a labelled `<table>` (aria-label =
  `pricing.models.title`) in a white card; format credits (`1 · per image`,
  `5s — 35 · 8s — 56`) and USD (`$0.01`, `from $0.35` via cheapest duration).
- Public API / exports: `ModelCreditTable`, `ModelCreditTableProps`
  (`models: CatalogModel[]`).
- Inputs → Outputs: catalog models (fetched by the ROUTE — this component is
  purely presentational) → semantic table rows keyed by `model.id`.
- Side effects: none.

## Dependencies
- Imports / depends on: `i18next` (`TFunction` type), `react-i18next`,
  `@opencreate/contracts` (`CatalogModel`), `../model/pricingData`
  (`CREDIT_USD`, `formatUsd`).
- Used by: `routes/_shell.pricing.tsx` (data state of its catalog query).

## Diagram
```mermaid
flowchart LR
  RQ[route useCatalog query] -- models --> MCT[ModelCreditTable.tsx]
  PD[pricingData CREDIT_USD/formatUsd] --> MCT
  I18N[pricing.models.* + generator.type.*] --> MCT
  MCT --> Table[semantic table on /pricing]
```

## Key decisions / gotchas
- The catalog query (and its 4 UI states) lives in the route on purpose — the
  Landing module stays free of Generator's data hooks; this keeps the module
  boundary clean while both reuse the SAME `['catalog']` cache entry.
- `creditsByDuration[String(d)]` can be `undefined` under
  `noUncheckedIndexedAccess` — renders an em-dash, never "undefined".
- Type column reuses `generator.type.*` keys instead of duplicating copy.

## Commits
- _pending: feat(web): pricing page with per-model credit table_
