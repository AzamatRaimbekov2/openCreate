# ShortsStudio.tsx — AI component doc

> AI-facing sidecar for `components/ShortsStudio.tsx`. Created 2026-08-20. Keep in sync.

## Purpose
The batch surface: pick one 9:16 format → pick a tier → fill N rows → read one price → confirm →
create drafts (free) → run every beat. It is NOT a second gallery; the shorts shelf already appears
in `/templates` because `TemplateCategory` widened by one value (ADR §1).

## What it does (for an AI reader)
- Props: `{ models, batchId, onBatchCreated }` — the catalog and the URL's batch id arrive from the
  ROUTE; the studio hands a new batch id back so the route can put it in the URL.
- Four states over `useTemplates()`: skeletons, error + retry, empty shelf, the picker/table.
- Side effects: `useCreateFilmBatch().mutate` on confirm, then `useBatchRun().start`.

## The order of the screen is the order of the decision
1. which format · 2. which tier (affordability answered before the click) · 3. the rows ·
4. one price and one button, behind a dialog that restates it.

## Dependencies
- Imports: `modules/Templates` (TemplateCard, TierPicker, useTemplates, useBalance), `shared/ui`
  (incl. `SpendConfirmModal`), `model/batchPlan`, `model/variantRows`, `model/batchApi`,
  `model/useBatchRun`, `./VariantsTable`, `./RunBoard`.
- Used by: `routes/_shell.shorts.index.tsx`.

## Key decisions / gotchas
- The confirm handler CLOSES the dialog first, then mutates (design.md §9): the thing worth watching
  is the board filling in, not a spinner on a question already answered.
- `plan.total === null` disables the run AND the confirm; the screen says WHY (price drift,
  incomplete rows) rather than leaving a mute disabled button.
- The tier is chosen once for the whole batch — mixing tiers inside one confirmed total is how an
  itemised price stops being itemised.
- `created` (batchId + film ids) lets the board render the instant the create answers, without
  waiting for the id to round-trip through the URL; the URL wins only when it points at a DIFFERENT
  batch, which is the reload/deep-link path.
- Creating charges nothing, and `['me']` is deliberately not refreshed at that point.

## Commits
- _no commit yet_
