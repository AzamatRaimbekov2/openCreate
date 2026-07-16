// apps/web/src/modules/Cinema/components/RenderBar.test.tsx
// Behavior of the export STATUS STRIP (v7 — pure presentation; FilmEditor owns
// the kick-off and the poll). The load-bearing assertions: idle renders
// NOTHING (the trigger lives in the header's ⋯ menu, and a block that exists
// to hold one button is chrome); processing shows progress; succeeded shows
// the Download link; failure shows a CALM localized retry that re-fires the
// export — never the raw ffmpeg text.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { FilmRender } from '@opencreate/contracts'
import { RenderBar } from './RenderBar'
import 'shared/config/i18n'

function makeRender(overrides: Partial<FilmRender>): FilmRender {
  return {
    id: 'r1',
    filmId: 'film1',
    status: 'processing',
    progress: null,
    mediaUrl: null,
    errorMessage: null,
    createdAt: '2026-07-09T10:00:00.000Z',
    completedAt: null,
    ...overrides,
  }
}

describe('RenderBar (status strip)', () => {
  it('renders nothing while idle — the trigger lives in the ⋯ menu', () => {
    const { container } = render(
      <RenderBar render={undefined} isStarting={false} hasStartError={false} onRetry={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows determinate progress while processing', () => {
    render(
      <RenderBar
        render={makeRender({ progress: 40 })}
        isStarting={false}
        hasStartError={false}
        onRetry={vi.fn()}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('40%')
  })

  it('shows the Download link on success', () => {
    render(
      <RenderBar
        render={makeRender({ status: 'succeeded', mediaUrl: '/media/r1.mp4' })}
        isStarting={false}
        hasStartError={false}
        onRetry={vi.fn()}
      />,
    )
    expect(screen.getByRole('link', { name: /download|скачать/i })).toHaveAttribute(
      'href',
      '/media/r1.mp4',
    )
  })

  it('offers a calm retry on failure that re-fires the export', async () => {
    const onRetry = vi.fn()
    render(
      <RenderBar
        render={makeRender({ status: 'failed', errorMessage: 'ffmpeg exploded: SIGSEGV' })}
        isStarting={false}
        hasStartError={false}
        onRetry={onRetry}
      />,
    )
    // Localized copy, never the raw server text
    expect(screen.queryByText(/SIGSEGV/)).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /try again|повторить/i }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('shows the retry state when the kick-off itself failed (no row yet)', () => {
    render(<RenderBar render={undefined} isStarting={false} hasStartError onRetry={vi.fn()} />)
    expect(screen.getByRole('button', { name: /try again|повторить/i })).toBeInTheDocument()
  })
})
