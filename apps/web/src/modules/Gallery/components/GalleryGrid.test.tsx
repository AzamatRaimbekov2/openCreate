// apps/web/src/modules/Gallery/components/GalleryGrid.test.tsx
// Behavior (plan Task 17): loading → 8 skeleton cards; error → ErrorState with
// retry; empty → EmptyState with a CTA to /create; data → cards + "Load more"
// when nextCursor; delete removes optimistically and rolls back on failure;
// the type filter narrows client-side.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Generation, GenerationList } from '@opencreate/contracts'
import { ApiClientError, api } from 'shared/libs/apiClient'
import { useViewSettings } from '../model/viewSettings'
import { GalleryGrid } from './GalleryGrid'
import type { GalleryGridProps } from './GalleryGrid'
// i18n init — the grid renders localized labels itself
import 'shared/config/i18n'

vi.mock('shared/libs/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared/libs/apiClient')>()
  return { ...actual, api: vi.fn() }
})

const apiMock = vi.mocked(api)

function makeGeneration(overrides: Partial<Generation>): Generation {
  return {
    id: 'gen1',
    type: 'image',
    mode: 'text',
    status: 'succeeded',
    prompt: 'a red fox in the snow',
    modelId: 'flux-schnell',
    params: { aspectRatio: '1:1' },
    costCredits: 1,
    mediaUrls: ['/media/gen1.webp'],
    progress: null,
    errorMessage: null,
    createdAt: '2026-07-06T10:00:00.000Z',
    completedAt: '2026-07-06T10:00:05.000Z',
    ...overrides,
  }
}

const fox = makeGeneration({ id: 'gen1', prompt: 'a red fox in the snow' })
const waves = makeGeneration({
  id: 'gen2',
  type: 'video',
  prompt: 'ocean waves at dusk',
  mediaUrls: ['/media/gen2.mp4'],
})

// Render inside a tiny real router: the empty-state CTA is a typed <Link> and
// needs router context; a /create stub makes href resolution exact.
function renderGrid(props?: GalleryGridProps) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <GalleryGrid {...props} />,
  })
  const createStub = createRoute({
    getParentRoute: () => rootRoute,
    path: '/create',
    component: () => null,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, createStub]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
  }
}

beforeEach(() => {
  apiMock.mockReset()
  // The view store is persisted (localStorage) and module-global — a leftover
  // 'table' from one test would silently reshape every later assertion
  useViewSettings.setState({ view: 'grid', gridSize: 'md' })
})

describe('GalleryGrid', () => {
  it('shows 8 skeleton cards while loading', async () => {
    apiMock.mockReturnValue(new Promise(() => {}))
    const { container } = renderGrid()
    await waitFor(() => {
      expect(container.querySelectorAll('.animate-skeleton')).toHaveLength(8)
    })
  })

  it('shows a retry error state on failure and recovers', async () => {
    apiMock.mockRejectedValueOnce(new ApiClientError('internal_error', 'boom', 500))
    renderGrid()
    const retry = await screen.findByRole('button', { name: /try again/i })
    apiMock.mockResolvedValue({ items: [fox], nextCursor: null } satisfies GenerationList)
    await userEvent.click(retry)
    expect(await screen.findByText(/red fox/i)).toBeInTheDocument()
  })

  it('shows an empty state with a CTA to /create', async () => {
    apiMock.mockResolvedValue({ items: [], nextCursor: null } satisfies GenerationList)
    renderGrid()
    expect(await screen.findByText(/no generations yet/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /create/i })).toHaveAttribute('href', '/create')
  })

  it('renders cards and loads the next page through "Load more"', async () => {
    const page2 = makeGeneration({ id: 'gen3', prompt: 'city lights timelapse' })
    apiMock.mockImplementation((path) =>
      String(path).includes('cursor=c1')
        ? Promise.resolve({ items: [page2], nextCursor: null })
        : Promise.resolve({ items: [fox, waves], nextCursor: 'c1' }),
    )
    renderGrid()
    expect(await screen.findByText(/red fox/i)).toBeInTheDocument()
    const loadMore = screen.getByRole('button', { name: /load more/i })
    await userEvent.click(loadMore)
    expect(await screen.findByText(/city lights/i)).toBeInTheDocument()
    expect(apiMock).toHaveBeenCalledWith('/api/generations?limit=24&cursor=c1')
    // Last page reached — the button disappears
    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument()
  })

  it('deletes optimistically and rolls back when the API rejects', async () => {
    apiMock.mockImplementation((path, init) => {
      if (init?.method === 'DELETE') {
        return Promise.reject(new ApiClientError('internal_error', 'boom', 500))
      }
      return Promise.resolve({ items: [fox], nextCursor: null })
    })
    renderGrid()
    expect(await screen.findByText(/red fox/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /delete/i }))
    // Rollback after the rejection — the card returns
    expect(await screen.findByText(/red fox/i)).toBeInTheDocument()
  })

  it('filters by type client-side', async () => {
    apiMock.mockResolvedValue({ items: [fox, waves], nextCursor: null } satisfies GenerationList)
    renderGrid({ filter: 'video' })
    expect(await screen.findByText(/ocean waves/i)).toBeInTheDocument()
    expect(screen.queryByText(/red fox/i)).not.toBeInTheDocument()
  })

  it('filters by model id', async () => {
    const kling = makeGeneration({ id: 'gen4', modelId: 'kling-3-pro', prompt: 'a lone cypress' })
    apiMock.mockResolvedValue({ items: [fox, kling], nextCursor: null } satisfies GenerationList)
    renderGrid({ modelId: 'kling-3-pro' })
    expect(await screen.findByText(/lone cypress/i)).toBeInTheDocument()
    expect(screen.queryByText(/red fox/i)).not.toBeInTheDocument()
  })

  it('filters by aspect ratio', async () => {
    const wide = makeGeneration({
      id: 'gen5',
      prompt: 'a wide horizon',
      params: { aspectRatio: '16:9' },
    })
    // `fox` is 1:1, so only the 16:9 item may survive
    apiMock.mockResolvedValue({ items: [fox, wide], nextCursor: null } satisfies GenerationList)
    renderGrid({ aspectRatio: '16:9' })
    expect(await screen.findByText(/wide horizon/i)).toBeInTheDocument()
    expect(screen.queryByText(/red fox/i)).not.toBeInTheDocument()
  })

  it('combines filters as an AND', async () => {
    const wideVideo = makeGeneration({
      id: 'gen6',
      type: 'video',
      prompt: 'a wide video',
      params: { aspectRatio: '16:9' },
      mediaUrls: ['/media/gen6.mp4'],
    })
    apiMock.mockResolvedValue({
      items: [fox, waves, wideVideo],
      nextCursor: null,
    } satisfies GenerationList)
    // waves is a video but 1:1; fox is 16:9-less and an image — only gen6 matches
    renderGrid({ filter: 'video', aspectRatio: '16:9' })
    expect(await screen.findByText(/a wide video/i)).toBeInTheDocument()
    expect(screen.queryByText(/ocean waves/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/red fox/i)).not.toBeInTheDocument()
  })

  // The distinction that matters: an over-filtered feed is NOT an empty library.
  // Offering "Create" there would answer a question the user did not ask.
  it('shows a no-matches state (not the empty state) when filters exclude everything', async () => {
    apiMock.mockResolvedValue({ items: [fox], nextCursor: null } satisfies GenerationList)
    renderGrid({ modelId: 'kling-3-pro' })
    expect(await screen.findByText(/nothing matches these filters/i)).toBeInTheDocument()
    expect(screen.queryByText(/no generations yet/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /create/i })).not.toBeInTheDocument()
  })

  it('still shows the empty state with a CTA when nothing is loaded at all', async () => {
    apiMock.mockResolvedValue({ items: [], nextCursor: null } satisfies GenerationList)
    renderGrid({ modelId: 'kling-3-pro' })
    expect(await screen.findByText(/no generations yet/i)).toBeInTheDocument()
    expect(screen.queryByText(/nothing matches these filters/i)).not.toBeInTheDocument()
  })

  // The three shapes of the same feed. Each asserts the STRUCTURE it promises,
  // not a class name — a grid that renders a <table> is broken regardless of CSS.
  it('renders a table in table view, with the generation as a row', async () => {
    useViewSettings.setState({ view: 'table' })
    apiMock.mockResolvedValue({ items: [fox], nextCursor: null } satisfies GenerationList)
    renderGrid()
    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: /red fox/i })).toBeInTheDocument()
  })

  it('renders a scroll-snap rail in slide view (no table)', async () => {
    useViewSettings.setState({ view: 'slide' })
    apiMock.mockResolvedValue({ items: [fox, waves], nextCursor: null } satisfies GenerationList)
    renderGrid()
    expect(await screen.findByText(/red fox/i)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByText(/ocean waves/i)).toBeInTheDocument()
  })

  it('changes grid column ramp with gridSize', async () => {
    useViewSettings.setState({ view: 'grid', gridSize: 'sm' })
    apiMock.mockResolvedValue({ items: [fox], nextCursor: null } satisfies GenerationList)
    renderGrid()
    const list = await screen.findByRole('list')
    // The 'sm' ramp starts at 2 columns on phones; 'md' starts at 1
    expect(list.className).toContain('grid-cols-2')
  })

  it('still filters in table view — the view must not resurrect filtered items', async () => {
    useViewSettings.setState({ view: 'table' })
    apiMock.mockResolvedValue({ items: [fox, waves], nextCursor: null } satisfies GenerationList)
    renderGrid({ filter: 'video' })
    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(screen.queryByRole('cell', { name: /red fox/i })).not.toBeInTheDocument()
    expect(screen.getByRole('cell', { name: /ocean waves/i })).toBeInTheDocument()
  })
})
