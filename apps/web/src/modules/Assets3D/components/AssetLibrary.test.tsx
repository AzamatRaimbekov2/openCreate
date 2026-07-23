// apps/web/src/modules/Assets3D/components/AssetLibrary.test.tsx
// Behavior of the modular-assets library (the 4-states rule): loading → shaped
// skeleton plates; error → ErrorState whose retry recovers; empty → EmptyState
// carrying the create action; data → a card per asset linking into its wizard.
// Plus: the header action opens the create modal.
// Mirrors CinemaLibrary.test's shape — mock the api client, render inside a tiny
// real router because AssetCard is a typed <Link>.
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
import type { Asset3d, Asset3dList } from '@opencreate/contracts'
import { ApiClientError, api } from 'shared/libs/apiClient'
import { AssetLibrary } from './AssetLibrary'
import 'shared/config/i18n'

vi.mock('shared/libs/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared/libs/apiClient')>()
  return { ...actual, api: vi.fn() }
})

const apiMock = vi.mocked(api)

function makeAsset(overrides: Partial<Asset3d>): Asset3d {
  return {
    id: 'asset1',
    title: 'Untitled asset',
    conceptImageUrl: '/media/concept1.png',
    createdAt: '2026-07-20T10:00:00.000Z',
    ...overrides,
  }
}

// The library page + an /assets/$assetId stub so AssetCard's typed Link resolves.
function renderLibrary() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <AssetLibrary />,
  })
  const wizardStub = createRoute({
    getParentRoute: () => rootRoute,
    path: '/assets/$assetId',
    component: () => null,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, wizardStub]),
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

describe('AssetLibrary', () => {
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
    apiMock.mockResolvedValue({ items: [makeAsset({ title: 'Iron Captain' })] } satisfies Asset3dList)
    await userEvent.click(retry)
    expect(await screen.findByText(/iron captain/i)).toBeInTheDocument()
  })

  it('shows an empty state with a create action', async () => {
    apiMock.mockResolvedValue({ items: [] } satisfies Asset3dList)
    renderLibrary()
    expect(await screen.findByText(/no assets yet/i)).toBeInTheDocument()
    // Header button + empty-state action carry the same label
    expect(screen.getAllByRole('button', { name: /new asset/i }).length).toBeGreaterThan(0)
  })

  it('renders a card per asset, each linking into its wizard', async () => {
    apiMock.mockResolvedValue({
      items: [
        makeAsset({ id: 'a', title: 'Iron Captain' }),
        makeAsset({ id: 'b', title: 'Reef Drone' }),
      ],
    } satisfies Asset3dList)
    renderLibrary()
    expect(await screen.findByText(/iron captain/i)).toBeInTheDocument()
    expect(screen.getByText(/reef drone/i)).toBeInTheDocument()
    const links = screen.getAllByRole('link')
    expect(links.some((link) => link.getAttribute('href') === '/assets/a')).toBe(true)
    expect(links.some((link) => link.getAttribute('href') === '/assets/b')).toBe(true)
  })

  it('opens the create modal from the header action', async () => {
    // A NON-empty list on purpose: with data on screen the header button is the
    // only control carrying this name, so the query cannot silently pick the
    // empty-state CTA instead of the affordance under test.
    apiMock.mockResolvedValue({ items: [makeAsset({})] } satisfies Asset3dList)
    renderLibrary()
    await userEvent.click(await screen.findByRole('button', { name: /new asset/i }))
    expect(await screen.findByRole('dialog', { name: /new modular asset/i })).toBeInTheDocument()
  })
})
