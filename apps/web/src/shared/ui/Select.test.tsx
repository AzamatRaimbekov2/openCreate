// apps/web/src/shared/ui/Select.test.tsx
// The kit's listbox contract. These assert BEHAVIOUR a native <select> gave us
// for free and that we now owe by hand: keyboard opening, arrow navigation,
// typeahead, Escape, focus restore, and the grouping that must never drop an
// option on the floor.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { Select } from './Select'
import type { SelectOption } from './Select'

type Fruit = 'apple' | 'banana' | 'cherry'

const FRUITS: SelectOption<Fruit>[] = [
  { value: 'apple', label: 'Apple', meta: '1 kg' },
  { value: 'banana', label: 'Banana' },
  { value: 'cherry', label: 'Cherry', description: 'Sour', badge: 'new' },
]

// A controlled harness — Select is controlled, so the test owns the value
function Harness({ options = FRUITS, ...rest }: Partial<Parameters<typeof Select<Fruit>>[0]>) {
  const [value, setValue] = useState<Fruit>('apple')
  return (
    <Select label="Fruit" options={options} value={value} onChange={setValue} {...rest} />
  )
}

const openPanel = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button'))
  return screen.getByRole('listbox', { name: 'Fruit' })
}

describe('Select', () => {
  it('names the trigger with the field label AND the current value', () => {
    render(<Harness />)
    // A bare aria-label would hide which option is chosen — the regression this
    // component shipped with once already
    expect(screen.getByRole('button')).toHaveAccessibleName(/fruit/i)
    expect(screen.getByRole('button')).toHaveAccessibleName(/apple/i)
  })

  it('opens on click and marks the selected option', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const listbox = await openPanel(user)
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
    expect(listbox).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /apple/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('option', { name: /banana/i })).toHaveAttribute('aria-selected', 'false')
  })

  it('opens from the keyboard on ArrowDown — the classic custom-select bug', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.tab()
    expect(screen.getByRole('button')).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('listbox', { name: 'Fruit' })).toBeInTheDocument()
  })

  it('commits the active option on Enter and restores focus to the trigger', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await openPanel(user)
    await user.keyboard('{ArrowDown}{Enter}')
    expect(screen.getByRole('button')).toHaveAccessibleName(/banana/i)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button')).toHaveFocus()
  })

  it('jumps to an option by typeahead', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await openPanel(user)
    await user.keyboard('c')
    await user.keyboard('{Enter}')
    expect(screen.getByRole('button')).toHaveAccessibleName(/cherry/i)
  })

  it('closes on Escape without changing the value', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await openPanel(user)
    await user.keyboard('{ArrowDown}{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button')).toHaveAccessibleName(/apple/i)
  })

  it('renders groups in order', async () => {
    const user = userEvent.setup()
    render(
      <Harness
        groups={[
          { label: 'Stone', values: ['cherry'] },
          { label: 'Pome', values: ['apple', 'banana'] },
        ]}
      />,
    )
    await openPanel(user)
    expect(screen.getByRole('group', { name: 'Stone' })).toBeInTheDocument()
    // Group order drives keyboard order: cherry is now index 0
    const options = screen.getAllByRole('option')
    expect(options[0]).toHaveTextContent('Cherry')
  })

  // A typo in `groups` must never silently swallow an option. This is the whole
  // reason flatten() appends orphans instead of trusting the group lists.
  it('still renders an option that no group claims', async () => {
    const user = userEvent.setup()
    render(<Harness groups={[{ label: 'Pome', values: ['apple'] }]} />)
    await openPanel(user)
    expect(screen.getByRole('option', { name: /banana/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /cherry/i })).toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(3)
  })
})
