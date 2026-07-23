// apps/web/src/modules/Soul/components/SoulCharacters.test.tsx
// The 4-states contract of the character list, in its RAIL layout (the studio's
// left column). One query, both layouts — so the rail must handle every state the
// grid does: loading skeletons → error + retry (recovering) → empty state → data
// rows that link into the soul card. Mocks the api client and renders inside a
// tiny real router because each row is a typed <Link> (CinemaLibrary.test style).
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
import type { Entity, EntityList } from '@opencreate/contracts'
import { ApiClientError, api } from 'shared/libs/apiClient'
import { SoulCharacters } from './SoulCharacters'
import 'shared/config/i18n'

vi.mock('shared/libs/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared/libs/apiClient')>()
  return { ...actual, api: vi.fn() }
})

const apiMock = vi.mocked(api)

function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'e1',
    kind: 'character',
    name: 'Аня',
    description: 'a woman',
    soul: { archetype: 'female', styleId: 'anime', traits: [], notes: '' },
    images: [],
    primaryImageId: null,
    createdAt: '2026-07-21T10:00:00.000Z',
    updatedAt: '2026-07-21T10:00:00.000Z',
    ...overrides,
  }
}

// The rail + a /soul/$entityId stub so a row's typed Link resolves.
function renderRail() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <SoulCharacters variant="rail" />,
  })
  const cardStub = createRoute({
    getParentRoute: () => rootRoute,
    path: '/soul/$entityId',
    component: () => null,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, cardStub]),
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

describe('SoulCharacters (rail)', () => {
  it('shows skeleton rows while loading', async () => {
    apiMock.mockReturnValue(new Promise(() => {}))
    const { container } = renderRail()
    await waitFor(() => {
      expect(container.querySelectorAll('.animate-skeleton').length).toBeGreaterThan(0)
    })
  })

  it('shows a retry error state on failure and recovers', async () => {
    apiMock.mockRejectedValueOnce(new ApiClientError('internal_error', 'boom', 500))
    renderRail()
    const retry = await screen.findByRole('button', { name: /try again/i })
    apiMock.mockResolvedValue({ items: [makeEntity({ name: 'Аня' })] } satisfies EntityList)
    await userEvent.click(retry)
    expect(await screen.findByText('Аня')).toBeInTheDocument()
  })

  it('shows the empty state when there are no characters', async () => {
    apiMock.mockResolvedValue({ items: [] } satisfies EntityList)
    renderRail()
    expect(await screen.findByText(/no characters yet/i)).toBeInTheDocument()
  })

  it('renders a row per character linking into its soul card', async () => {
    apiMock.mockResolvedValue({
      items: [makeEntity({ id: 'a', name: 'Аня' }), makeEntity({ id: 'b', name: 'Борис' })],
    } satisfies EntityList)
    renderRail()
    expect(await screen.findByText('Аня')).toBeInTheDocument()
    expect(screen.getByText('Борис')).toBeInTheDocument()
    const links = screen.getAllByRole('link')
    expect(links.some((link) => link.getAttribute('href') === '/soul/a')).toBe(true)
    expect(links.some((link) => link.getAttribute('href') === '/soul/b')).toBe(true)
  })
})
