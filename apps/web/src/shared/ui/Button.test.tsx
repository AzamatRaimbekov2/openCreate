// apps/web/src/shared/ui/Button.test.tsx
// Behavior: label renders and clicks fire; while loading the button is disabled,
// exposes aria-busy and shows the inline spinner.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './Button'

describe('Button', () => {
  it('renders its label and fires onClick', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Create</Button>)
    await userEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('shows a spinner and is disabled while loading', () => {
    render(<Button isLoading>Create</Button>)
    const button = screen.getByRole('button', { name: 'Create' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByTestId('button-spinner')).toBeInTheDocument()
  })

  it('does not render a spinner when idle', () => {
    render(<Button>Create</Button>)
    expect(screen.queryByTestId('button-spinner')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled()
  })
})
