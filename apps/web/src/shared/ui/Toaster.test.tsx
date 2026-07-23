// apps/web/src/shared/ui/Toaster.test.tsx
// The Toaster is the portal that renders the store's toasts. Behaviour under
// test: per-item live-region roles (error = role="alert"/assertive, info/success
// = role="status"/polite), keyboard dismissal from a close button, an ASYNC
// action that shows a pending state and dismisses the toast when it settles, and
// auto-dismiss that PAUSES while the toast is hovered (so a user reading it never
// loses it mid-sentence).
import { act, render, screen, waitFor } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toaster } from './Toaster'
import { toast } from './toast'
import { useToastStore } from './toastStore'
// i18n init — the region label + close button come from translation keys
import 'shared/config/i18n'

beforeEach(() => {
  useToastStore.getState().clear()
})

describe('Toaster', () => {
  it('gives an error toast role=alert and an info toast role=status', async () => {
    render(<Toaster />)
    act(() => {
      toast.error({ title: 'Generation failed' })
      toast.info({ title: 'Heads up' })
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('Generation failed')
    expect(screen.getByRole('status')).toHaveTextContent('Heads up')
  })

  it('exposes the stack as an accessible, labelled region', async () => {
    render(<Toaster />)
    act(() => {
      toast.info({ title: 'Present' })
    })
    // The container carries an accessible name so a screen-reader user can find it
    expect(await screen.findByRole('region')).toBeInTheDocument()
  })

  it('dismisses a toast from its close button (keyboard reachable)', async () => {
    render(<Toaster />)
    act(() => {
      toast.info({ title: 'Bye soon' })
    })
    await screen.findByText('Bye soon')
    await userEvent.click(screen.getByRole('button', { name: /close|закрыть/i }))
    expect(screen.queryByText('Bye soon')).not.toBeInTheDocument()
  })

  it('runs an async action, shows it busy, then dismisses the toast', async () => {
    render(<Toaster />)
    let resolveAction: () => void = () => {}
    const onClick = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveAction = resolve
        }),
    )
    act(() => {
      toast.error({ title: 'Blocked', action: { label: 'Soften', onClick } })
    })
    const button = await screen.findByRole('button', { name: 'Soften' })
    await userEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
    // Pending while the promise is in flight — no double fire, visible progress
    await waitFor(() => expect(button).toHaveAttribute('aria-busy', 'true'))
    act(() => {
      resolveAction()
    })
    await waitFor(() => expect(screen.queryByText('Blocked')).not.toBeInTheDocument())
  })

  it('auto-dismisses after its duration', () => {
    vi.useFakeTimers()
    try {
      render(<Toaster />)
      act(() => {
        toast.info({ title: 'Ephemeral', durationMs: 1000 })
      })
      expect(screen.getByText('Ephemeral')).toBeInTheDocument()
      act(() => {
        vi.advanceTimersByTime(1100)
      })
      expect(screen.queryByText('Ephemeral')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('pauses the auto-dismiss timer while the toast is hovered', () => {
    vi.useFakeTimers()
    try {
      render(<Toaster />)
      act(() => {
        toast.info({ title: 'Sticky on hover', durationMs: 1000 })
      })
      const item = screen.getByRole('status')
      fireEvent.mouseEnter(item)
      act(() => {
        vi.advanceTimersByTime(2000)
      })
      // Still there — the clock is paused under the pointer
      expect(screen.getByText('Sticky on hover')).toBeInTheDocument()
      fireEvent.mouseLeave(item)
      act(() => {
        vi.advanceTimersByTime(1100)
      })
      expect(screen.queryByText('Sticky on hover')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})
