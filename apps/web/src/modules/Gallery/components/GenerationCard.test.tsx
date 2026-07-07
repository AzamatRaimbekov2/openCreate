// apps/web/src/modules/Gallery/components/GenerationCard.test.tsx
// Behavior (plan Task 17, v3 stage-3 tiles): processing → Progress % + pulsing
// SQUARE media tile, no <video>; succeeded video → <video controls src> +
// green "ready" chip + download + delete; failed → danger border +
// errorMessage + "credits refunded" badge + delete; a processing card that
// polls into a terminal state invalidates the list and the balance; a
// succeeded image opens the detail modal; delete asks for confirmation in an
// alertdialog — cancel deletes nothing, confirm fires the DELETE mutation and
// only then removes the item optimistically.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { InfiniteData } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Generation, GenerationList } from '@opencreate/contracts'
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

// A safety-filter block: the API sets errorCode 'content_blocked' and the raw
// provider message — the card must render OUR localized copy, not the raw text
const blockedVideo: Generation = {
  ...failedVideo,
  errorMessage: 'NSFW content detected',
  errorCode: 'content_blocked',
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
  it('processing: shows progress percent and a pulsing square tile, no video', async () => {
    // The poll returns the same processing state — the card stays in-flight
    apiMock.mockResolvedValue(processingVideo)
    const { container } = renderCard(processingVideo)
    const progressbar = await screen.findByRole('progressbar')
    expect(progressbar).toHaveAttribute('aria-valuenow', '40')
    expect(screen.getByText('40%')).toBeInTheDocument()
    expect(container.querySelector('.animate-skeleton')).toBeInTheDocument()
    // v3 stage-3: gallery media wells are SQUARE tiles regardless of the
    // generation's own aspect (this one is 9:16)
    expect(container.querySelector('.aspect-square')).toBeInTheDocument()
    expect(container.querySelector('video')).not.toBeInTheDocument()
  })

  it('succeeded video: renders a playable video with a ready chip, download and delete', () => {
    const { container } = renderCard(succeededVideo)
    const video = container.querySelector('video')
    expect(video).toHaveAttribute('controls')
    expect(video).toHaveAttribute('src', '/media/gen1.mp4')
    // The green status chip says it plainly — never color alone
    expect(screen.getByText(/^ready$/i)).toBeInTheDocument()
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
    // v3 triad: failed status = glow-red border on the well
    expect(container.querySelector('.border-glow-red')).toBeInTheDocument()
    expect(screen.getByText('timeoutProvider')).toBeInTheDocument()
    expect(screen.getByText(/credits refunded/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument()
    expect(container.querySelector('video')).not.toBeInTheDocument()
  })

  it('failed without a code: localized generic primary, raw text only as the secondary line', () => {
    renderCard(failedVideo)
    // The primary reason is OUR copy — never the raw server string
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument()
    // The raw provider text may only be the quiet secondary diagnostic line
    expect(screen.getByText('timeoutProvider')).toHaveClass('text-mist-dim')
  })

  it('failed with provider_error: localized provider copy as the primary message', () => {
    renderCard({
      ...failedVideo,
      errorCode: 'provider_error',
      errorMessage: 'Runware task xyz failed',
    })
    expect(screen.getByText(/provider could not finish/i)).toBeInTheDocument()
    expect(screen.getByText('Runware task xyz failed')).toHaveClass('text-mist-dim')
  })

  it('failed with content_blocked: shows the localized safety message, not the raw provider text', () => {
    renderCard(blockedVideo)
    expect(screen.getByText(/blocked by the safety filter/i)).toBeInTheDocument()
    // The raw provider message is not user copy — it must not leak through
    expect(screen.queryByText('NSFW content detected')).not.toBeInTheDocument()
    expect(screen.getByText(/credits refunded/i)).toBeInTheDocument()
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

// Polling never runs unbounded (QA findings 1-2): past the 20-minute budget
// the card says "taking longer than usual" in the processing AMBER with a
// manual refresh; a failed per-item poll shows ErrorState + retry instead of
// sitting at "Generating N%" forever.
describe('GenerationCard stalled and poll-error states', () => {
  // The shared processing fixture's createdAt (2026-07-06) is already far
  // beyond the 20-minute budget against the real clock — stalled by default
  it('stalled: shows the amber "taking longer" note with a refresh button', async () => {
    apiMock.mockResolvedValue(processingVideo)
    renderCard(processingVideo)
    const note = await screen.findByText(/taking longer than usual/i)
    // Amber = the triad's processing tone (never red — nothing failed yet)
    expect(note).toHaveClass('text-glow-amber')
    // Progress stays visible — stalled is a nuance of processing, not an end
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
    const refresh = screen.getByRole('button', { name: /refresh/i })
    const callsBefore = apiMock.mock.calls.length
    await userEvent.click(refresh)
    // The manual refresh restarts polling exactly once
    await waitFor(() => {
      expect(apiMock.mock.calls.length).toBe(callsBefore + 1)
    })
  })

  it('fresh processing card: no stalled note within the budget', async () => {
    const freshProcessing: Generation = {
      ...processingVideo,
      createdAt: new Date().toISOString(),
    }
    apiMock.mockResolvedValue(freshProcessing)
    renderCard(freshProcessing)
    await screen.findByRole('progressbar')
    expect(screen.queryByText(/taking longer than usual/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /refresh/i })).not.toBeInTheDocument()
  })

  it('failed first poll: shows the error state with retry instead of a stuck progress', async () => {
    apiMock.mockRejectedValueOnce(new Error('network down'))
    renderCard(processingVideo)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/could not check/i)
    // The stuck "Generating N%" UI is gone — the failure is said out loud
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    // Retry restarts the query; a processing answer brings the progress back
    apiMock.mockResolvedValue(processingVideo)
    await userEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByRole('progressbar')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

// A paid generation must never die in one click: delete opens a blocking
// confirmation alertdialog; only an explicit confirm fires the mutation and
// the optimistic cache removal (review finding, 2026-07-07).
describe('GenerationCard delete confirmation', () => {
  // The ['generations'] cache page holding the card — the optimistic removal
  // filters THIS data, so it is the honest sensor for "card removed"
  const seededList: InfiniteData<GenerationList> = {
    pages: [{ items: [succeededVideo], nextCursor: null }],
    pageParams: [null],
  }

  function renderSeededCard() {
    const { queryClient } = renderCard(succeededVideo)
    queryClient.setQueryData(['generations'], seededList)
    return { queryClient }
  }

  function cachedItems(queryClient: QueryClient): Generation[] {
    const data = queryClient.getQueryData<InfiniteData<GenerationList>>(['generations'])
    return data?.pages.flatMap((page) => page.items) ?? []
  }

  it('opens a confirmation alertdialog without deleting anything', async () => {
    const { queryClient } = renderSeededCard()
    await userEvent.click(screen.getByRole('button', { name: /delete/i }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveAccessibleName(/delete this generation/i)
    expect(dialog).toHaveTextContent(/cannot be undone/i)
    // Nothing fired, nothing removed — the dialog is only a question
    expect(apiMock).not.toHaveBeenCalled()
    expect(cachedItems(queryClient)).toHaveLength(1)
  })

  it('cancel closes the dialog and deletes nothing', async () => {
    const { queryClient } = renderSeededCard()
    await userEvent.click(screen.getByRole('button', { name: /delete/i }))
    const dialog = await screen.findByRole('alertdialog')
    await userEvent.click(within(dialog).getByRole('button', { name: /cancel/i }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(apiMock).not.toHaveBeenCalled()
    expect(cachedItems(queryClient)).toHaveLength(1)
  })

  it('confirm fires the DELETE mutation and removes the card optimistically', async () => {
    apiMock.mockResolvedValue(undefined)
    const { queryClient } = renderSeededCard()
    await userEvent.click(screen.getByRole('button', { name: /delete/i }))
    const dialog = await screen.findByRole('alertdialog')
    await userEvent.click(within(dialog).getByRole('button', { name: /^delete$/i }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(apiMock).toHaveBeenCalledWith('/api/generations/gen1', { method: 'DELETE' })
    })
    expect(cachedItems(queryClient)).toHaveLength(0)
  })
})
