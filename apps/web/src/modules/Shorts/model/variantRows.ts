// apps/web/src/modules/Shorts/model/variantRows.ts
// The variants table's data model: one row per short, one cell per template knob.
//
// PURE list operations over plain objects, with ids supplied by the caller. Two
// consequences, both deliberate:
//   · every operation is provable in a unit test without a DOM or a clock;
//   · id GENERATION stays outside, so a test can name its rows and a component
//     can use crypto.randomUUID() without the model importing a browser API.
//
// WHY IDS AT ALL, when the table is an array the user reads top to bottom: React
// keys and edit targeting. An index key would re-point row 3's in-flight edit at
// row 4's data the moment row 2 is deleted, and this table is where the user
// spends ten minutes writing forty hook lines before pressing a button that
// costs a thousand credits. Losing one of them to a delete is not acceptable.
//
// NOT IN HERE: cast entities, style packages, voices. ADR shorts-studio §5 —
// those are durable inventory chosen ONCE for the whole batch, and conflating
// them with per-row knobs is what makes a batch incoherent (forty clips need one
// brand and one face). A row supplies knob values only.
import type {
  CreateFilmsFromTemplateBatchRow,
  TemplateSummary,
} from '@opencreate/contracts'

// One short-to-be.
export type VariantRow = {
  // Client-side identity, stable across every edit. Never an array index.
  id: string
  // Overrides the film title the server would compose from the knobs. Empty
  // string = "no opinion", which is the honest default and the common case.
  title: string
  // Knob values, keyed by the template's own `variable.key`.
  variables: Record<string, string>
}

// The wire shape one row becomes — the contract's own row type, not a local
// look-alike. `title` is OMITTED rather than sent empty: the server composes a
// title from the variables, and an empty string would be a claim that the user
// wanted a nameless film.
export type BatchRowInput = CreateFilmsFromTemplateBatchRow

// A fresh row on the template's own defaults, so it is complete and runnable the
// instant it appears — the same reasoning as TemplateDetailModal's initialValues.
export function seedRow(template: TemplateSummary, id: string): VariantRow {
  return {
    id,
    title: '',
    variables: Object.fromEntries(
      template.variables.map((variable) => [variable.key, variable.defaultValue]),
    ),
  }
}

// Copy a row in place, directly after its source. Duplicate-then-edit is the
// intended way to build a varied batch, and the copy has to land where the user
// is looking or the gesture reads as "nothing happened".
export function duplicateRow(
  rows: readonly VariantRow[],
  id: string,
  newId: string,
): VariantRow[] {
  const index = rows.findIndex((row) => row.id === id)
  if (index === -1) return [...rows]
  const source = rows[index]
  if (!source) return [...rows]
  const copy: VariantRow = { ...source, id: newId, variables: { ...source.variables } }
  return [...rows.slice(0, index + 1), copy, ...rows.slice(index + 1)]
}

export function removeRow(rows: readonly VariantRow[], id: string): VariantRow[] {
  return rows.filter((row) => row.id !== id)
}

// Edit ONE knob of ONE row. Untouched rows keep their object identity so the
// table does not re-render forty inputs because one character was typed.
export function patchRowVariable(
  rows: readonly VariantRow[],
  id: string,
  key: string,
  value: string,
): VariantRow[] {
  return rows.map((row) =>
    row.id === id ? { ...row, variables: { ...row.variables, [key]: value } } : row,
  )
}

// Edit the film title. A SEPARATE operation from the knobs on purpose: one
// string-keyed setter would let a template declaring a {{title}} knob overwrite
// the film's own name, and the two live in different namespaces.
export function patchRowTitle(
  rows: readonly VariantRow[],
  id: string,
  title: string,
): VariantRow[] {
  return rows.map((row) => (row.id === id ? { ...row, title } : row))
}

// Can this row be sent?
//
// THIS IS THE WHOLE OF THE CLIENT'S PER-ROW VALIDATION, and it carries more
// weight than the single-film equivalent because the batch endpoint HAS NO
// PARTIAL SUCCESS: one bad row rejects all twenty and writes nothing, and the
// 400 comes back as prose naming a key — not a per-row error list this table
// could highlight from. So correctness is established here, before the POST,
// against the template's own declarations:
//   · every declared knob must be non-blank — a blank one substitutes an empty
//     line into a spoken beat or an on-screen title;
//   · a SELECT value must be one of that knob's declared options. The table
//     cannot produce anything else, but the server validates against the closed
//     set, and a rule the client relies on should be one the client also checks.
export function isRowComplete(template: TemplateSummary, row: VariantRow): boolean {
  return template.variables.every((variable) => {
    const value = (row.variables[variable.key] ?? '').trim()
    if (value.length === 0) return false
    if (variable.kind !== 'select') return true
    return (variable.options ?? []).some((option) => option.value === value)
  })
}

// Table → wire. Drops the client id, trims and omits an absent title.
export function toBatchRows(rows: readonly VariantRow[]): BatchRowInput[] {
  return rows.map((row) => {
    const title = row.title.trim()
    return { variables: { ...row.variables }, ...(title ? { title } : {}) }
  })
}

// A fresh row id. The ONE impure function in this file, kept here so callers do
// not each reach for a different generator — the pure operations above still
// take the id as an argument, which is what keeps them testable by name.
export function newRowId(): string {
  return crypto.randomUUID()
}
