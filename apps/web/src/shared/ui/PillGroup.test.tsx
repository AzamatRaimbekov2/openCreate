// apps/web/src/shared/ui/PillGroup.test.tsx
// Behavior: a labelled group of pill buttons; the selected pill is exposed via
// aria-pressed, clicking a pill reports its typed value. Shared by the
// Generator (type/aspect/duration) and Gallery (filter chips) modules.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PillGroup } from './PillGroup'

const options = [
  { value: '16:9', label: '16:9' },
  { value: '1:1', label: '1:1' },
  { value: '9:16', label: '9:16' },
]

describe('PillGroup', () => {
  it('renders a labelled group with the selected pill pressed', () => {
    render(<PillGroup label="Aspect ratio" options={options} value="1:1" onChange={() => {}} />)
    const group = screen.getByRole('group', { name: 'Aspect ratio' })
    expect(within(group).getAllByRole('button')).toHaveLength(3)
    expect(within(group).getByRole('button', { name: '1:1' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(group).getByRole('button', { name: '16:9' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('reports the clicked value through onChange', async () => {
    const onChange = vi.fn()
    render(<PillGroup label="Aspect ratio" options={options} value="1:1" onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: '9:16' }))
    expect(onChange).toHaveBeenCalledWith('9:16')
  })
})
