// apps/web/src/modules/Gallery/components/GenerationCard.test.tsx
// Behavior (plan Task 17): processing → Progress % + pulsing media placeholder,
// no <video>; succeeded video → <video controls src> + download + delete;
// failed → danger border + errorMessage + "credits refunded" badge + delete;
// a processing card that polls into a terminal state invalidates the list and
// the balance; a succeeded image opens the detail modal.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Generation } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'
import { GenerationCard } from './GenerationCard'
// i18n init — the card renders localized labels itself
import 'shared/config/i18n'

vi.mock('shared/libs/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared/libs/apiClient')>()
  return { ...actual, api: vi.fn() }
})

const apiMock = vi.mocked(api)

const processingVideo: Generation = {
  id: 'gen1',
  type: 'video',
  mode: 'text',
  status: 'processing',
  prompt: 'ocean waves at dusk',
  modelId: 'pixverse-v6',
  params: { aspectRatio: '9:16', duration: 5 },
  costCredits: 35,
  mediaUrls: [],
  progress: 40,
  errorMessage: null,
  createdAt: '2026-07-06T10:00:00.000Z',
  completedAt: null,
}

const succeededVideo: Generation = {
  ...processingVideo,
  status: 'succeeded',
  mediaUrls: ['/media/gen1.mp4'],
  progress: 100,
  completedAt: '2026-07-06T10:01:00.000Z',
}

const failedVideo: Generation = {
  ...processingVideo,
  status: 'failed',
  errorMessage: 'timeoutProvider',
  completedAt: '2026-07-06T10:01:00.000Z',
}

const succeededImage: Generation = {
  ...processingVideo,
  id: 'gen2',
  type: 'image',
  status: 'succeeded',
  prompt: 'a red fox in the snow',
  modelId: 'flux-schnell',
  params: { aspectRatio: '1:1' },
  costCredits: 1,
  mediaUrls: ['/media/gen2.webp'],
  progress: null,
  completedAt: '2026-07-06T10:01:00.000Z',
}

function renderCard(generation: Generation) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <GenerationCard generation={generation} />
      </QueryClientProvider>,
    ),
  }
}

beforeEach(() => {
  apiMock.mockReset()
})

describe('GenerationCard', () => {
  it('processing: shows progress percent and a pulsing placeholder, no video', async () => {
    // The poll returns the same processing state — the card stays in-flight
    apiMock.mockResolvedValue(processingVideo)
    const { container } = renderCard(processingVideo)
    const progressbar = await screen.findByRole('progressbar')
    expect(progressbar).toHaveAttribute('aria-valuenow', '40')
    expect(screen.getByText('40%')).toBeInTheDocument()
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
    expect(container.querySelector('video')).not.toBeInTheDocument()
  })

  it('succeeded video: renders a playable video with download and delete', () => {
    const { container } = renderCard(succeededVideo)
    const video = container.querySelector('video')
    expect(video).toHaveAttribute('controls')
    expect(video).toHaveAttribute('src', '/media/gen1.mp4')
    expect(screen.getByRole('link', { name: /download/i })).toHaveAttribute(
      'href',
      '/media/gen1.mp4',
    )
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument()
    // Terminal item from the list — no polling request
    expect(apiMock).not.toHaveBeenCalled()
  })

  it('failed: shows danger border, error text, refunded badge and delete', () => {
    const { container } = renderCard(failedVideo)
    expect(container.querySelector('.border-danger')).toBeInTheDocument()
    expect(screen.getByText('timeoutProvider')).toBeInTheDocument()
    expect(screen.getByText(/credits refunded/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument()
    expect(container.querySelector('video')).not.toBeInTheDocument()
  })

  it('invalidates the list and balance when polling reaches a terminal state', async () => {
    apiMock.mockResolvedValue(succeededVideo)
    const { queryClient } = renderCard(processingVideo)
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['generations'] })
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['me'] })
    })
  })

  it('succeeded image: opens the detail modal from the media button', async () => {
    renderCard(succeededImage)
    expect(screen.getByRole('img', { name: /red fox/i })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /red fox/i }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('a red fox in the snow')
  })
})
