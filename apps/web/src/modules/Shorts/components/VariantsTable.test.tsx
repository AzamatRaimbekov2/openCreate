// The variants table. One row per short, one column per template knob, and the
// gesture the whole feature is built around: duplicate a row, change one line.
//
// ADR shorts-studio §9 is why this is a table and not a "how many copies?" field:
// a batch VARIES by default. YouTube's Inauthentic Content Policy demonetises
// repetitive mass-produced AI video, so N identical rows is the degenerate case,
// not the happy path — and the UI has to make varying cheaper than not varying.
//
// CSV import is out of scope for this phase by the ADR's own deferral list; the
// table ships first and an importer is a reader on top of it.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TEMPLATE_BATCH_MAX_ROWS } from '@opencreate/contracts'
import type { VariantRow } from '../model/variantRows'
import { seedRow } from '../model/variantRows'
import { SHORTS_TEMPLATE } from '../model/testFixtures'
import { VariantsTable } from './VariantsTable'
import 'shared/config/i18n'

function renderTable(rows: VariantRow[], onChange = vi.fn()) {
  render(<VariantsTable template={SHORTS_TEMPLATE} rows={rows} onChange={onChange} />)
  return { onChange }
}

describe('VariantsTable', () => {
  it('renders one column per knob, plus the film title', () => {
    renderTable([seedRow(SHORTS_TEMPLATE, 'a')])
    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent)
    expect(headers).toEqual(
      expect.arrayContaining(['Title', 'Hook line', 'Setting']),
    )
  })

  it('renders one row per short, seeded from the template defaults', () => {
    renderTable([seedRow(SHORTS_TEMPLATE, 'a'), seedRow(SHORTS_TEMPLATE, 'b')])
    expect(screen.getAllByRole('row')).toHaveLength(3) // header + two shorts
    expect(screen.getAllByDisplayValue('What do you regret most?')).toHaveLength(2)
  })

  it('adds a short', async () => {
    const user = userEvent.setup()
    const { onChange } = renderTable([seedRow(SHORTS_TEMPLATE, 'a')])
    await user.click(screen.getByRole('button', { name: 'Add a short' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0]?.[0] as VariantRow[]
    expect(next).toHaveLength(2)
    // The new row is complete on arrival — the user may run without touching it.
    expect(next[1]?.variables).toEqual({ hook: 'What do you regret most?', setting: 'tokyo' })
  })

  it('duplicates a short in place, so the copy lands where the user is looking', async () => {
    const user = userEvent.setup()
    const rows = [seedRow(SHORTS_TEMPLATE, 'a'), seedRow(SHORTS_TEMPLATE, 'b')]
    const { onChange } = renderTable(rows)
    await user.click(screen.getByRole('button', { name: 'Duplicate this short 1' }))
    const next = onChange.mock.calls[0]?.[0] as VariantRow[]
    expect(next).toHaveLength(3)
    expect(next[2]?.id).toBe('b')
  })

  it('removes a short by its own row, not by position', async () => {
    const user = userEvent.setup()
    const rows = ['a', 'b', 'c'].map((id) => seedRow(SHORTS_TEMPLATE, id))
    const { onChange } = renderTable(rows)
    await user.click(screen.getByRole('button', { name: 'Remove this short 2' }))
    const next = onChange.mock.calls[0]?.[0] as VariantRow[]
    expect(next.map((row) => row.id)).toEqual(['a', 'c'])
  })

  it('edits one cell of one row', async () => {
    const user = userEvent.setup()
    const rows = [seedRow(SHORTS_TEMPLATE, 'a'), seedRow(SHORTS_TEMPLATE, 'b')]
    const { onChange } = renderTable(rows)
    const secondRow = screen.getAllByRole('row')[2]
    if (!secondRow) throw new Error('expected a second short')
    await user.type(within(secondRow).getByLabelText('Hook line'), '!')
    const next = onChange.mock.calls.at(-1)?.[0] as VariantRow[]
    expect(next[1]?.variables['hook']).toBe('What do you regret most?!')
    expect(next[0]?.variables['hook']).toBe('What do you regret most?')
  })

  it('shows the empty state rather than a bare header when there are no shorts', () => {
    renderTable([])
    expect(screen.getByText('No shorts in the table')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('stops at the batch ceiling and says the number, rather than letting the server refuse', () => {
    // The API rejects a batch over TEMPLATE_BATCH_MAX_ROWS with a 400 that writes
    // NOTHING. Losing a filled table of twenty-one hand-written hook lines is not
    // an acceptable way to learn a limit — and the control stays visible while
    // disabled, because a vanished one reads as the feature having moved.
    const full = Array.from({ length: TEMPLATE_BATCH_MAX_ROWS }, (_, index) =>
      seedRow(SHORTS_TEMPLATE, `r${index}`),
    )
    renderTable(full)
    expect(screen.getByRole('button', { name: 'Add a short' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Duplicate this short 1' })).toBeDisabled()
    expect(screen.getByText(`${TEMPLATE_BATCH_MAX_ROWS} / ${TEMPLATE_BATCH_MAX_ROWS}`)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Twenty shorts is the most')
    // Removing is still offered — the ceiling is on growth, not on editing.
    expect(screen.getByRole('button', { name: 'Remove this short 1' })).toBeEnabled()
  })

  it('offers Add and Duplicate one row below the ceiling', () => {
    const nearly = Array.from({ length: TEMPLATE_BATCH_MAX_ROWS - 1 }, (_, index) =>
      seedRow(SHORTS_TEMPLATE, `r${index}`),
    )
    renderTable(nearly)
    expect(screen.getByRole('button', { name: 'Add a short' })).toBeEnabled()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('locks every control while a batch is running', () => {
    // The table describes a run the user already paid for. Editing it mid-flight
    // would show a plan that no longer matches what is being charged.
    render(
      <VariantsTable
        template={SHORTS_TEMPLATE}
        rows={[seedRow(SHORTS_TEMPLATE, 'a')]}
        onChange={vi.fn()}
        disabled
      />,
    )
    expect(screen.getByLabelText('Hook line')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add a short' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove this short 1' })).toBeDisabled()
  })
})
