// apps/web/src/modules/Shorts/components/VariantsTable.tsx
// One row per short, one column per template knob.
//
// WHY A TABLE AND NOT A "how many copies?" FIELD. ADR shorts-studio §9: a batch
// VARIES by default. YouTube's Inauthentic Content Policy demonetises repetitive
// mass-produced AI video on a three-strike path that ends in permanent removal
// from the partner programme, so variation is not a nicety here — it is the
// feature's licence to exist. A spinner marked "× 20" would make the degenerate
// case the default gesture. A table makes VARYING the cheap thing: duplicate the
// row you just wrote, change the one line that matters, run.
//
// A REAL <table>, with real column headers. Forty inputs in a flex grid are a
// grid to a sighted user and a flat list of forty unlabelled fields to everyone
// else. `scope="col"` is what makes each cell announce which knob it is, which
// is also why every control passes `labelHidden` rather than dropping its label:
// the name still exists, it just is not painted forty times.
//
// CONTROLLED, and deliberately so. The rows live in ShortsStudio because the
// PRICE is derived from them and has to update on the same keystroke — a table
// holding its own draft would let the total lag the thing it is pricing.
//
// OUT OF SCOPE THIS PHASE (ADR deferral list): CSV / spreadsheet import. The
// table ships first; an importer is a reader that writes these same rows.
import { useTranslation } from 'react-i18next'
import { TEMPLATE_BATCH_MAX_ROWS } from '@opencreate/contracts'
import type { TemplateSummary } from '@opencreate/contracts'
import { Button, Card, EmptyState, Input, Select } from 'shared/ui'
import type { VariantRow } from '../model/variantRows'
import {
  duplicateRow,
  newRowId,
  patchRowTitle,
  patchRowVariable,
  removeRow,
  seedRow,
} from '../model/variantRows'

export type VariantsTableProps = {
  // The format every row instantiates. Its `variables` ARE the columns.
  template: TemplateSummary
  rows: VariantRow[]
  onChange: (rows: VariantRow[]) => void
  // Locked while a batch is running: the table describes a run the user already
  // paid for, and editing it mid-flight would show a plan that no longer matches
  // what is being charged.
  disabled?: boolean
}

const CELL = 'px-2 py-2 align-top'

export function VariantsTable({ template, rows, onChange, disabled = false }: VariantsTableProps) {
  const { t } = useTranslation()
  // The server refuses a batch over TEMPLATE_BATCH_MAX_ROWS (20 — the same
  // number as the 20/min submit bucket) with a 400 that writes nothing. Losing a
  // filled table of twenty-one hand-written hook lines to a refusal is not an
  // acceptable way to learn a limit, so the ceiling is enforced HERE, visibly,
  // with the reason stated — the `StyleReferenceImages` law: keep the control,
  // disable it, and say the number, because a vanished control reads as the
  // feature having moved.
  const isAtCap = rows.length >= TEMPLATE_BATCH_MAX_ROWS

  if (rows.length === 0) {
    return (
      <EmptyState
        title={t('shorts.table.empty.title')}
        description={t('shorts.table.empty.description')}
        action={
          <Button onClick={() => onChange([seedRow(template, newRowId())])} disabled={disabled}>
            {t('shorts.table.add')}
          </Button>
        }
      />
    )
  }

  return (
    <Card
      padding="none"
      title={t('shorts.table.title')}
      action={
        <div className="flex items-center gap-3">
          <span className={`text-xs tabular-nums ${isAtCap ? 'text-lumen-amber' : 'text-mist-dim'}`}>
            {t('shorts.table.count', { rows: rows.length, max: TEMPLATE_BATCH_MAX_ROWS })}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange([...rows, seedRow(template, newRowId())])}
            disabled={disabled || isAtCap}
          >
            {t('shorts.table.add')}
          </Button>
        </div>
      }
    >
      <p className="px-4 pb-3 text-xs text-mist-dim">{t('shorts.table.lead')}</p>
      {isAtCap ? (
        <p role="status" className="px-4 pb-3 text-xs text-lumen-amber">
          {t('shorts.table.atCap', { max: TEMPLATE_BATCH_MAX_ROWS })}
        </p>
      ) : null}

      {/* The horizontal scroller is on the table, not the page: a template with
          three knobs still fits at 390px, and one that does not must not drag
          the whole layout sideways. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-y border-white/10 text-xs text-mist-dim">
              <th scope="col" className="w-10 px-2 py-2 font-normal">
                <span className="sr-only">{t('shorts.table.numberColumn')}</span>
              </th>
              <th scope="col" className="px-2 py-2 font-normal">
                {t('shorts.table.titleColumn')}
              </th>
              {template.variables.map((variable) => (
                <th key={variable.key} scope="col" className="px-2 py-2 font-normal">
                  {variable.label}
                </th>
              ))}
              <th scope="col" className="w-24 px-2 py-2 font-normal">
                <span className="sr-only">{t('shorts.table.actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id} className="border-b border-white/5 transition-colors hover:bg-ridge/40">
                {/* The ordinal is the only decorative mark on the row, and it is
                    the portal blue the design system reserves for exactly that. */}
                <th scope="row" className={`${CELL} text-xs font-normal text-portal tabular-nums`}>
                  {index + 1}
                </th>

                <td className={CELL}>
                  <Input
                    label={t('shorts.table.rowLabel', { index: index + 1 })}
                    labelHidden
                    value={row.title}
                    placeholder={t('shorts.table.titlePlaceholder')}
                    disabled={disabled}
                    onChange={(event) => onChange(patchRowTitle(rows, row.id, event.target.value))}
                  />
                </td>

                {template.variables.map((variable) =>
                  variable.kind === 'select' ? (
                    <td key={variable.key} className={CELL}>
                      <Select
                        label={variable.label}
                        labelHidden
                        options={(variable.options ?? []).map((option) => ({
                          value: option.value,
                          label: option.label,
                        }))}
                        value={row.variables[variable.key] ?? variable.defaultValue}
                        onChange={(value) =>
                          onChange(patchRowVariable(rows, row.id, variable.key, value))
                        }
                      />
                    </td>
                  ) : (
                    <td key={variable.key} className={CELL}>
                      <Input
                        label={variable.label}
                        labelHidden
                        maxLength={variable.maxLength}
                        value={row.variables[variable.key] ?? ''}
                        disabled={disabled}
                        onChange={(event) =>
                          onChange(
                            patchRowVariable(rows, row.id, variable.key, event.target.value),
                          )
                        }
                      />
                    </td>
                  ),
                )}

                <td className={CELL}>
                  <div className="flex items-center gap-1">
                    {/* The row ordinal rides in BOTH accessible names: forty
                        buttons all called "Duplicate" are forty identical
                        announcements and one very expensive misclick. */}
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t('shorts.table.duplicate') + ` ${index + 1}`}
                      // Duplicate adds a row, so it hits the same ceiling as Add.
                      disabled={disabled || isAtCap}
                      onClick={() => onChange(duplicateRow(rows, row.id, newRowId()))}
                    >
                      <CopyGlyph />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t('shorts.table.remove') + ` ${index + 1}`}
                      disabled={disabled}
                      onClick={() => onChange(removeRow(rows, row.id))}
                    >
                      <RemoveGlyph />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function CopyGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-4"
    >
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h8" />
    </svg>
  )
}

function RemoveGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-4"
    >
      <path d="M5 12h14" />
    </svg>
  )
}
