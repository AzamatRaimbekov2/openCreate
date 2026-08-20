# variantRows.ts — AI model doc

> AI-facing sidecar for `model/variantRows.ts`. Created 2026-08-20. Keep in sync with the code.

## Purpose
The variants table's data as pure list operations: one row per short, one cell per template knob.
Duplicate-then-edit is the intended flow (ADR shorts-studio §9 — a batch VARIES by default, because
YouTube's Inauthentic Content Policy demonetises repetitive mass-produced AI video).

## What it does (for an AI reader)
- Public API: `seedRow`, `duplicateRow`, `removeRow`, `patchRowVariable`, `patchRowTitle`,
  `isRowComplete`, `toBatchRows`, `newRowId`; types `VariantRow`, `BatchRowInput`.
- Inputs → Outputs: a template + a row list → a new row list. Ids are supplied by the caller, which
  is what keeps every operation testable by name.
- Side effects: none, except `newRowId()` (the one impure function, `crypto.randomUUID`).

## Dependencies
- Imports: `TemplateSummary` type only.
- Used by: `VariantsTable.tsx`, `ShortsStudio.tsx`, `batchApi.ts` (the `BatchRowInput` wire shape).

## Key decisions / gotchas
- Row identity is a generated id, NEVER an array index: deleting row 2 of five must not re-point
  row 3's in-flight edit at row 4's data, in a table where the user just wrote forty hook lines.
- `patchRowVariable` and `patchRowTitle` are SEPARATE. One string-keyed setter would let a template
  declaring a `{{title}}` knob overwrite the film's own name — they are different namespaces.
- `toBatchRows` OMITS an empty title rather than sending `''`: the server composes a title from the
  knobs, and an empty string would be a claim the user wanted a nameless film. Its return type IS
  the contract's `CreateFilmsFromTemplateBatchRow`, not a local look-alike.
- `isRowComplete` carries more weight than the single-film equivalent because the batch endpoint has
  **no partial success**: one bad row rejects all twenty and writes nothing, and the 400 is prose
  naming a key rather than a per-row list this table could highlight from. So it checks both that
  every declared knob is non-blank AND that a `select` value is inside its declared option set.
- Reusable assets (cast, styles, voices) are NOT here — ADR §5, they are durable inventory chosen
  once for the whole batch, not per row.

## Commits
- _no commit yet_
