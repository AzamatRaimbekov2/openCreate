# ModelPicker.tsx — AI component doc

> AI-facing sidecar for `ModelPicker.tsx`. Created 2026-07-06. Keep this in sync with the code on every change.

## Purpose

Model-card selector of the Generator panel: one pressed-state card per catalog
model of the current type, each showing product name + honest provider label +
credit price.

## What it does (for an AI reader)

- Responsibilities: render selectable model cards (`aria-pressed`). Controlled; no state.
- Public API / exports: `ModelPicker` with `ModelPickerProps = { models: CatalogModel[], selectedId: string | null, onSelect(modelId) }`.
- Inputs → Outputs: type-filtered models + selection → `onSelect` with the clicked model id.
- Side effects: none.

## Dependencies

- Imports: `react-i18next`, `i18next` (`TFunction` type for the `priceHint` helper —
  a structural signature fights `exactOptionalPropertyTypes`), `@opencreate/contracts` (`CatalogModel`).
- Used by: `components/GeneratorPanel.tsx`.

## Diagram

```mermaid
flowchart LR
  GP[GeneratorPanel models by type] --> MP[ModelPicker role=group 'Model'] -->|onSelect id| ST[generatorStore.setModel]
  MP --> CARD[card: name + providerLabel + price hint]
```

## Key decisions / gotchas

- Provider label is always visible under our product name — the spec's honesty
  rule (users see "FLUX schnell" / "PixVerse V6", never a rebadged black box).
- Price hint: image → flat `generator.cost` ("≈ 1 credit"); video →
  `generator.model.from` with the CHEAPEST duration ("from 35") so cards stay
  comparable before a duration is picked.
- Custom cards instead of shared `PillGroup`: cards carry three lines of
  content, not a single label — different component class (module-owned UI).
- v3 terminal restyle: catalog cards — `rounded-lg` white/10 hairline frames on
  the void, `font-medium text-white` model name (500 = the weight ceiling),
  quiet lowercase mono caption; SELECTED = amber specimen tint
  (`border-glow-amber/60 bg-specimen-amber/20`, price hint `text-glow-amber`)
  because the reference explicitly files "model picker highlights" under amber;
  hover steps toward `bg-ridge/40`. Never a solid fill.
  Roles (`aria-pressed`, group name) and i18n untouched.

## Commits

- 2b7dd54 2026-07-06 feat(web): generator module — prompt, model/aspect/duration, i2v upload, cost
- cb228e3 2026-07-07 restyle(web): editorial app shell, auth, generator, gallery
- 252ab38 2026-07-07 restyle(web): terminal design system — cosmic void tokens, jetbrains mono, specimen pills + docs
