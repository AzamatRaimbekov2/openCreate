# GeneratorPanel.tsx — AI component doc

> AI-facing sidecar for `GeneratorPanel.tsx`. Created 2026-07-06. Keep this in sync with the code on every change.

## Purpose

The Generator module's main surface (create page): the full generation form as the
stage-3 editorial "commission sheet" — a hairline-framed sheet of NUMBERED field
groups (type toggle, model cards, prompt, aspect/duration, optional i2v upload)
separated by hairlines, closed by a serif cost numeral + Generate footer —
orchestrating the store, the catalog query, and the mutation.

## What it does (for an AI reader)

- Responsibilities: catalog 4-states (skeletons / ErrorState retry / defensive
  EmptyState / form); sync catalog → store; build the ORDERED `fields` array (stable
  group-id keys; render position feeds each `SheetField`'s decorative ordinal) so
  conditional groups renumber cleanly; gate submit on `selectCreateInput`; surface
  mutation failures inline via `SubmitErrorBanner`.
- Public API / exports: `GeneratorPanel` (no props — state lives in `generatorStore`).
- Inputs → Outputs: user edits → store actions; submit → `useCreateGeneration.mutate(input)`;
  `insufficient_credits` → inline `role="alert"` banner + `/pricing` link;
  `content_blocked` (NSFW safety filter) → dedicated localized banner
  (`generator.errors.contentBlocked`: try a different prompt + credits refunded);
  other errors → localized generic banner.
- Side effects: `useEffect` pushes `catalog.data.models` into the store (cache → store sync).

## Dependencies

- Imports: `shared/ui` (`Button`, `EmptyState`, `ErrorState`, `PillGroup`, `Skeleton`),
  module model (`catalogApi`, `createGeneration`, `generatorStore`), sibling components
  (`AspectPicker`, `CostLabel`, `DurationPicker`, `ImageDrop`, `ModelPicker`,
  `PromptField`, `SheetField`, `SubmitErrorBanner`), `react-i18next`. (`ApiClientError`
  moved into `SubmitErrorBanner` with the error-classification logic.)
- Used by: `routes/create.tsx` via `modules/Generator` public API.

## Diagram

```mermaid
flowchart TD
  UC[useCatalog] -->|models| ST[(generatorStore)]
  ST --> FLD[ordered fields array → SheetField rows 01…]
  FLD --> TT[PillGroup type] & MP[ModelPicker] & PR[PromptField] & AP[AspectPicker] & DP[DurationPicker video-only] & ID[ImageDrop i2v-only]
  ST --> CL[CostLabel serif numeral]
  ST -->|selectCreateInput| SUB[Generate button]
  SUB --> M[useCreateGeneration]
  M -->|error| SEB[SubmitErrorBanner: insufficient/blocked/generic]
```

## Key decisions / gotchas

- Prompt is a plain store-backed textarea, NOT React Hook Form: the plan puts the
  whole draft in the Zustand store and validation is the contracts zod schema via
  `selectCreateInput` — a parallel RHF state would just duplicate it (recorded deviation).
- `/pricing` is a typed `<Link>` since Task 20 shipped the route — SPA
  navigation keeps the drafted prompt alive in the store if the user returns
  (the pre-Task-20 plain `<a>` escape hatch is gone as promised).
- Duration and ImageDrop are conditionally MOUNTED (not disabled): a control that
  cannot apply to the current model should not exist in the a11y tree.
- Insufficient credits is not a modal: the failure has an inline next step
  (pricing), so frontend-error-ux keeps it non-blocking.
- Stage 3 restyle (2026-07-07): white card → hairline sheet frame; field groups →
  `SheetField` rows with derived decorative ordinals; prompt + error banner extracted
  to `PromptField` / `SubmitErrorBanner` (200-line cap); footer = closing hairline
  with the serif cost numeral. Behavior, roles, i18n keys and tests untouched; new
  key `generator.sheet` names the sheet head in both locales.

## Commits

- 2b7dd54 2026-07-06 feat(web): generator module — prompt, model/aspect/duration, i2v upload, cost
- a04eac7 2026-07-06 feat(web): pricing page with per-model credit table (pricing anchor → typed Link)
- 3b96d8c fix(api,web,contracts): respect the NSFW flag — content_blocked failure with refund, never store flagged assets, localized safety copy
