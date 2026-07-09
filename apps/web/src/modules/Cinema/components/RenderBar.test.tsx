// apps/web/src/modules/Cinema/components/RenderBar.test.tsx
// Behavior of the export control: kick a render (POST 202 processing) → poll the
// render → on succeeded show a Download link to the served mp4; on failed show a
// CALM localized retry (never the raw ffmpeg error); disabled with no shots. The
// query fires its first poll the moment a renderId exists (React Query does not
// wait for the interval), so the succeeded case needs no fake timers.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { FilmRender } from '@opencreate/contracts'
import { ApiClientError, api } from 'shared/libs/apiClient'
import { RenderBar } from './RenderBar'
import 'shared/config/i18n'

vi.mock('shared/libs/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared/libs/apiClient')>()
  return { ...actual, api: vi.fn() }
})

const apiMock = vi.mocked(api)

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

function renderBar(canRender = true) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <RenderBar filmId="film1" canRender={canRender} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  apiMock.mockReset()
})

describe('RenderBar', () => {
  it('renders then polls to a download link', async () => {
    apiMock.mockImplementation((path, init) => {
      // POST kicks the render (202 processing)
      if (init?.method === 'POST') return Promise.resolve(makeRender({ status: 'processing' }))
      // The first poll comes back succeeded with the served mp4
      return Promise.resolve(
        makeRender({ status: 'succeeded', progress: 100, mediaUrl: '/media/r1.mp4' }),
      )
    })
    renderBar()
    await userEvent.click(screen.getByRole('button', { name: /render mp4/i }))
    const link = await screen.findByRole('link', { name: /download mp4/i })
    expect(link).toHaveAttribute('href', '/media/r1.mp4')
  })

  it('shows a calm localized retry on a failed render (never the raw error)', async () => {
    apiMock.mockImplementation((path, init) => {
      if (init?.method === 'POST') return Promise.resolve(makeRender({ status: 'processing' }))
      return Promise.resolve(
        makeRender({ status: 'failed', errorMessage: 'ffmpeg exited with code 137' }),
      )
    })
    renderBar()
    await userEvent.click(screen.getByRole('button', { name: /render mp4/i }))
    expect(await screen.findByText(/render didn't finish/i)).toBeInTheDocument()
    // The raw provider/exit message must never reach the UI
    expect(screen.queryByText(/ffmpeg/i)).not.toBeInTheDocument()
  })

  it('disables the render button when there are no shots', () => {
    renderBar(false)
    expect(screen.getByRole('button', { name: /render mp4/i })).toBeDisabled()
  })

  it('surfaces a kick-off failure without raw text', async () => {
    apiMock.mockRejectedValue(new ApiClientError('rate_limited', 'slow down please', 429))
    renderBar()
    await userEvent.click(screen.getByRole('button', { name: /render mp4/i }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText(/slow down please/i)).not.toBeInTheDocument()
  })
})
