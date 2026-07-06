// apps/web/src/shared/ui/ErrorState.test.tsx
// Behavior: shows the (already localized) message in an alert region and the
// retry button fires its callback; without a callback there is no button.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ErrorState } from './ErrorState'
// i18n init — ErrorState renders the localized "Try again" label itself
import 'shared/config/i18n'

describe('ErrorState', () => {
  it('shows the message and fires the retry callback', async () => {
    const onRetry = vi.fn()
    render(<ErrorState message="We could not load the data." onRetry={onRetry} />)
    expect(screen.getByRole('alert')).toHaveTextContent('We could not load the data.')
    await userEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('renders without a retry button when no callback is given', () => {
    render(<ErrorState message="We could not load the data." />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
