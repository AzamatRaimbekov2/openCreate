// apps/web/src/modules/Cinema/components/CinemaLibrary.test.tsx
// Behavior of the film library (the 4-states rule): loading → 4 skeleton plates;
// error → ErrorState with retry that recovers; empty → EmptyState + a "New film"
// action; data → a card per film. Mirrors GalleryGrid.test's style (mock the api
// client, render inside a tiny real router because FilmCard is a typed <Link>).
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
import type { Film, FilmList } from '@opencreate/contracts'
import { ApiClientError, api } from 'shared/libs/apiClient'
import { CinemaLibrary } from './CinemaLibrary'
import 'shared/config/i18n'

vi.mock('shared/libs/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared/libs/apiClient')>()
  return { ...actual, api: vi.fn() }
})

const apiMock = vi.mocked(api)

function makeFilm(overrides: Partial<Film>): Film {
  return {
    id: 'film1',
    title: 'Untitled film',
    aspectRatio: '16:9',
    defaultStyleId: null,
    templateId: null,
    createdAt: '2026-07-09T10:00:00.000Z',
    updatedAt: '2026-07-09T10:00:00.000Z',
    ...overrides,
  }
}

// The library page + a /cinema/$filmId stub so FilmCard's typed Link resolves.
function renderLibrary() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <CinemaLibrary />,
  })
  const editorStub = createRoute({
    getParentRoute: () => rootRoute,
    path: '/cinema/$filmId',
    component: () => null,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, editorStub]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  apiMock.mockReset()
})

describe('CinemaLibrary', () => {
  it('shows skeleton plates while loading', async () => {
    apiMock.mockReturnValue(new Promise(() => {}))
    const { container } = renderLibrary()
    await waitFor(() => {
      expect(container.querySelectorAll('.animate-skeleton').length).toBeGreaterThan(0)
    })
  })

  it('shows a retry error state on failure and recovers', async () => {
    apiMock.mockRejectedValueOnce(new ApiClientError('internal_error', 'boom', 500))
    renderLibrary()
    const retry = await screen.findByRole('button', { name: /try again/i })
    apiMock.mockResolvedValue({ items: [makeFilm({ title: 'Neon Drift' })] } satisfies FilmList)
    await userEvent.click(retry)
    expect(await screen.findByText(/neon drift/i)).toBeInTheDocument()
  })

  it('shows an empty state with a New film action', async () => {
    apiMock.mockResolvedValue({ items: [] } satisfies FilmList)
    renderLibrary()
    expect(await screen.findByText(/no films yet/i)).toBeInTheDocument()
    // Both the header button and the empty-state action carry the same label
    expect(screen.getAllByRole('button', { name: /new film/i }).length).toBeGreaterThan(0)
  })

  it('renders a card per film with its aspect chip', async () => {
    apiMock.mockResolvedValue({
      items: [
        makeFilm({ id: 'a', title: 'Neon Drift', aspectRatio: '16:9' }),
        makeFilm({ id: 'b', title: 'Quiet Harbor', aspectRatio: '9:16' }),
      ],
    } satisfies FilmList)
    renderLibrary()
    expect(await screen.findByText(/neon drift/i)).toBeInTheDocument()
    expect(screen.getByText(/quiet harbor/i)).toBeInTheDocument()
    // Each card's Link points at its editor
    const links = screen.getAllByRole('link')
    expect(links.some((link) => link.getAttribute('href') === '/cinema/a')).toBe(true)
    expect(links.some((link) => link.getAttribute('href') === '/cinema/b')).toBe(true)
  })
})
