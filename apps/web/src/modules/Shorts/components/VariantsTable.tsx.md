# VariantsTable.tsx — AI component doc

> AI-facing sidecar for `components/VariantsTable.tsx`. Created 2026-08-20. Keep in sync.

## Purpose
One row per short, one column per template knob, with add / duplicate / delete. Controlled by
`ShortsStudio` because the PRICE derives from these rows and must update on the same keystroke.

## What it does (for an AI reader)
- Props: `{ template, rows, onChange, disabled? }`.
- Renders a real `<table>` with `scope="col"` headers; each cell control passes `labelHidden` so its
  accessible name survives without painting the column name in forty cells.
- Four states: empty (EmptyState + "Add a short"), data (the grid). Loading/error belong to the
  studio, which owns the queries.
- Side effects: none. Every gesture is a pure list operation from `model/variantRows`.

## Dependencies
- Imports: `shared/ui` (Button, Card, EmptyState, Input, Select), `model/variantRows`.
- Used by: `ShortsStudio.tsx`.

## Key decisions / gotchas
- A TABLE, not a "how many copies?" spinner: ADR §9 — a batch varies by default, and the UI has to
  make varying cheaper than not varying.
- Duplicate inserts the copy DIRECTLY AFTER its source; a copy appended to the end reads as
  "nothing happened".
- Row ordinals ride in the duplicate/remove `aria-label`s — forty buttons all called "Duplicate" are
  forty identical announcements and one very expensive misclick.
- `disabled` locks everything while a run is in flight: the table describes a run already paid for.
- **The ceiling is `TEMPLATE_BATCH_MAX_ROWS` (20) and it is enforced here, visibly.** The API rejects
  a larger batch with a 400 that writes nothing, and losing a filled table of twenty-one
  hand-written hook lines is not an acceptable way to learn a limit. Add and Duplicate go
  `disabled` at the cap (Remove stays live — the ceiling is on growth, not on editing), an amber
  `N / 20` counter is always visible, and a `role="status"` line states the reason. That is the
  `StyleReferenceImages` law: keep the control, disable it, say the number.
- CSV / spreadsheet import is OUT of scope this phase (ADR deferral list).

## Commits
- _no commit yet_
