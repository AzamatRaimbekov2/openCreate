// The run board. ADR shorts-studio §2: "a batch survives a reload because it was
// never in memory to begin with." That sentence is the whole spec of this file,
// so the load-bearing test here is the REMOUNT one — the board rebuilt from
// films plus the shared ['generation', id] cache, with the run store empty,
// still tells the truth about every beat.
//
// The rest is ExtractStage's discipline applied per beat: one failure shows its
// own reason on its own chip, in our words, without taking its siblings down.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FilmDetail, Generation, Shot } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'
import { resetBatchRun } from '../model/useBatchRun'
import { TIER_MODEL } from '../model/testFixtures'
import { RunBoard } from './RunBoard'
import 'shared/config/i18n'

vi.mock('shared/libs/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared/libs/apiClient')>()
  return { ...actual, api: vi.fn() }
})
const apiMock = vi.mocked(api)

const shot = (id: string, overrides: Partial<Shot> = {}): Shot => ({
  id,
  filmId: 'f1',
  orderIndex: 0,
  generationId: null,
  prompt: 'a fox crosses the street',
  promptPreset: null,
  entityRefs: [],
  referenceImages: [],
  modelId: TIER_MODEL.id,
  aspectRatio: null,
  durationMs: 8000,
  trimStartMs: 0,
  transition: 'none',
  transitionMs: 0,
  title: null,
  voiceover: null,
  audio: false,
  createdAt: '2026-08-20T10:00:00.000Z',
  ...overrides,
})

const film = (shots: Shot[]): FilmDetail => ({
  film: {
    id: 'f1',
    title: 'Tokyo regret',
    aspectRatio: '9:16',
    defaultStyleId: null,
    templateId: 'street-hook',
    batchId: 'batch-1',
    coverUrl: null,
    createdAt: '2026-08-20T10:00:00.000Z',
    updatedAt: '2026-08-20T10:00:00.000Z',
  },
  shots,
  audio: [],
  latestRender: null,
})

const generation = (id: string, status: Generation['status'], errorCode?: string) =>
  ({ id, status, mediaUrls: [], errorCode: errorCode ?? null }) as unknown as Generation

// Whatever the SERVER would answer for these generations — the board never gets
// them any other way, which is the point of the remount test below.
function serve(rows: Generation[]) {
  const byId = new Map(rows.map((row) => [row.id, row]))
  apiMock.mockImplementation((path: string) =>
    Promise.resolve(byId.get(path.split('/').pop() ?? '') as unknown as never),
  )
}

// A tiny real router, because each film card carries a typed <Link> into the
// Cinema editor — a short IS a film, and that link is its exit.
function renderBoard(
  films: FilmDetail[],
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  props: Partial<Parameters<typeof RunBoard>[0]> = {},
) {
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => (
      <RunBoard
        films={films}
        models={[TIER_MODEL]}
        isPending={false}
        isError={false}
        onRetryLoad={vi.fn()}
        {...props}
      />
    ),
  })
  const cinemaStub = createRoute({
    getParentRoute: () => rootRoute,
    path: '/cinema/$filmId',
    component: () => null,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, cinemaStub]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { ...view, queryClient }
}

beforeEach(() => {
  apiMock.mockReset()
  resetBatchRun()
})

describe('RunBoard', () => {
  it('renders skeletons while the films load', async () => {
    renderBoard([], undefined, { isPending: true })
    expect(await screen.findByRole('status')).toBeInTheDocument()
  })

  it('renders an error with a retry when the films cannot be read', async () => {
    const user = userEvent.setup()
    const onRetryLoad = vi.fn()
    renderBoard([], undefined, { isError: true, onRetryLoad })
    await user.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(onRetryLoad).toHaveBeenCalledTimes(1)
  })

  it('renders the empty state before anything has been run', async () => {
    renderBoard([])
    expect(await screen.findByText('Nothing running yet')).toBeInTheDocument()
  })

  it('rebuilds every beat from films plus the shared cache after a REMOUNT', async () => {
    // The reload story, as a test. The run store is empty (resetBatchRun above),
    // exactly as it is after a page load: the board's only inputs are the films
    // and the ['generation', id] entries every poller in the app shares.
    serve([
      generation('g1', 'succeeded'),
      generation('g2', 'processing'),
      generation('g3', 'failed', 'content_blocked'),
    ])
    const films = [
      film([
        shot('s0', { prompt: '', modelId: null }),
        shot('s1', { generationId: 'g1' }),
        shot('s2', { generationId: 'g2' }),
        shot('s3', { generationId: 'g3' }),
      ]),
    ]
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { unmount } = renderBoard(films, queryClient)
    expect(await screen.findByText('ready')).toBeInTheDocument()
    unmount()

    renderBoard(films, queryClient)
    const beats = await screen.findAllByRole('listitem')
    // Four beats: the free title card plus three payable ones, all still right.
    expect(beats.map((beat) => beat.textContent)).toEqual([
      expect.stringContaining('title card'),
      expect.stringContaining('ready'),
      expect.stringContaining('rendering'),
      expect.stringContaining('failed'),
    ])
  })

  it('names the reason on the failed beat, in our words, and leaves the rest alone', async () => {
    serve([generation('g1', 'succeeded'), generation('g2', 'failed', 'content_blocked')])
    renderBoard([film([shot('s1', { generationId: 'g1' }), shot('s2', { generationId: 'g2' })])])
    // The safety filter's own message, never a provider string.
    expect(
      await screen.findByText('Blocked by the safety filter — try a different prompt.'),
    ).toBeInTheDocument()
    expect(screen.getByText('ready')).toBeInTheDocument()
  })

  it('offers a priced retry on a failed beat and nowhere else', async () => {
    serve([generation('g1', 'succeeded'), generation('g2', 'failed', 'provider_error')])
    renderBoard([film([shot('s1', { generationId: 'g1' }), shot('s2', { generationId: 'g2' })])])
    // 8 seconds on the tier model = 30 credits. A retry is a fresh purchase (the
    // failed attempt was already refunded), so the price is on the control.
    const retries = await screen.findAllByRole('button', { name: /Retry this beat/ })
    expect(retries).toHaveLength(1)
    expect(retries[0]).toHaveTextContent('30 cr')
  })

  it('re-submits exactly the beat whose retry was pressed', async () => {
    const user = userEvent.setup()
    serve([generation('g1', 'failed', 'provider_error')])
    renderBoard([film([shot('s1', { generationId: 'g1' })])])
    const retry = await screen.findByRole('button', { name: /Retry this beat/ })
    apiMock.mockImplementation((path: string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'POST') {
        return Promise.resolve({ id: 'g2', status: 'processing', mediaUrls: [] } as unknown as never)
      }
      if (init?.method === 'PATCH') return Promise.resolve({ id: 's1' } as unknown as never)
      return Promise.resolve(generation('g2', 'succeeded') as unknown as never)
    })
    await user.click(retry)
    const posts = apiMock.mock.calls.filter(
      ([path, init]) => path === '/api/generations' && (init as RequestInit)?.method === 'POST',
    )
    expect(posts).toHaveLength(1)
  })

  it('counts progress per film off the derived states', async () => {
    serve([generation('g1', 'succeeded'), generation('g2', 'failed', 'provider_error')])
    renderBoard([
      film([
        shot('s0', { prompt: '', modelId: null }),
        shot('s1', { generationId: 'g1' }),
        shot('s2', { generationId: 'g2' }),
        shot('s3'),
      ]),
    ])
    const card = await screen.findByRole('article', { name: 'Tokyo regret' })
    // Three payable beats, one ready — the free title card is not progress.
    expect(await within(card).findByText('1 of 3 clips')).toBeInTheDocument()
    expect(await within(card).findByText('1 failed')).toBeInTheDocument()
  })
})
