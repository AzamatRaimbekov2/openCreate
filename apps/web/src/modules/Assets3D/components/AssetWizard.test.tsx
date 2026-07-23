// apps/web/src/modules/Assets3D/components/AssetWizard.test.tsx
// Behavior of the stage-shaped wizard shell. The wizard has ONE route; the
// asset's own state decides which stage is active, so these tests drive the
// aggregate and assert which stage the user lands on:
//   · every part still draft  → Parts
//   · a part extracted, none meshed → Extraction
//   · a part meshing → Meshes
//   · all parts ready → Assembly
// Plus the two things that must NOT be errors: an EMPTY CATALOG is a first-class
// disabled state (prices unknown, not a failure), and the rail lets the user walk
// back to a completed stage.
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
import type { Asset3dDetail, Asset3dPart, CatalogModel, PartStatus } from '@opencreate/contracts'
import { ApiClientError, api } from 'shared/libs/apiClient'
import { AssetWizard } from './AssetWizard'
import { useWizardStore } from '../model/wizardStore'
import 'shared/config/i18n'

vi.mock('shared/libs/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared/libs/apiClient')>()
  return { ...actual, api: vi.fn() }
})

const apiMock = vi.mocked(api)

function makePart(id: string, status: PartStatus): Asset3dPart {
  return {
    id,
    assetId: 'asset1',
    name: `Part ${id}`,
    description: '',
    sortOrder: 0,
    // Citations follow the status closely enough for the shell's purposes; the
    // DERIVED status on the DTO is what deriveStage actually reads.
    imageGenerationId: status === 'draft' ? null : `img-${id}`,
    meshGenerationId: status === 'ready' || status === 'meshing' ? `mesh-${id}` : null,
    transform: null,
    status,
    createdAt: '2026-07-20T10:00:00.000Z',
  }
}

function makeDetail(parts: Asset3dPart[]): Asset3dDetail {
  return {
    asset: {
      id: 'asset1',
      title: 'Iron Captain',
      conceptImageUrl: '/media/concept1.png',
      createdAt: '2026-07-20T10:00:00.000Z',
    },
    parts,
  }
}

function renderWizard(models: CatalogModel[] = []) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <AssetWizard assetId="asset1" models={models} />,
  })
  const listStub = createRoute({
    getParentRoute: () => rootRoute,
    path: '/assets',
    component: () => null,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, listStub]),
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
  useWizardStore.getState().reset()
})

describe('AssetWizard', () => {
  it('shows skeletons while the aggregate loads', async () => {
    apiMock.mockReturnValue(new Promise(() => {}))
    const { container } = renderWizard()
    // RouterProvider paints on a microtask, so the first assertion must wait
    await waitFor(() => {
      expect(container.querySelectorAll('.animate-skeleton').length).toBeGreaterThan(0)
    })
  })

  it('shows a calm error when the asset is not ours', async () => {
    apiMock.mockRejectedValue(new ApiClientError('not_found', 'nope', 404))
    renderWizard()
    expect(await screen.findByText(/does not exist, or is not yours/i)).toBeInTheDocument()
  })

  it('lands on Parts while any part is still a draft', async () => {
    apiMock.mockResolvedValue(makeDetail([makePart('p1', 'draft'), makePart('p2', 'extracted')]))
    renderWizard()
    expect(await screen.findByRole('heading', { level: 2, name: /^parts$/i })).toBeInTheDocument()
  })

  it('lands on Extraction once nothing is a draft but a part is unmeshed', async () => {
    apiMock.mockResolvedValue(makeDetail([makePart('p1', 'extracted')]))
    renderWizard()
    expect(
      await screen.findByRole('heading', { level: 2, name: /^extraction$/i }),
    ).toBeInTheDocument()
  })

  it('lands on Meshes while a part is meshing', async () => {
    apiMock.mockResolvedValue(makeDetail([makePart('p1', 'meshing'), makePart('p2', 'ready')]))
    renderWizard()
    expect(await screen.findByRole('heading', { level: 2, name: /^meshes$/i })).toBeInTheDocument()
  })

  it('lands on Assembly when every part is ready', async () => {
    apiMock.mockResolvedValue(makeDetail([makePart('p1', 'ready'), makePart('p2', 'ready')]))
    renderWizard()
    expect(await screen.findByRole('heading', { level: 2, name: /^assembly$/i })).toBeInTheDocument()
  })

  it('treats an empty catalog as a normal disabled state, not an error', async () => {
    apiMock.mockResolvedValue(makeDetail([makePart('p1', 'extracted')]))
    renderWizard([])
    expect(
      await screen.findByRole('heading', { level: 2, name: /^extraction$/i }),
    ).toBeInTheDocument()
    // No ErrorState anywhere: a price we cannot quote yet is not a failure
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument()
  })

  it('walks back to a completed stage from the rail', async () => {
    apiMock.mockResolvedValue(makeDetail([makePart('p1', 'extracted')]))
    renderWizard()
    await screen.findByRole('heading', { level: 2, name: /^extraction$/i })
    // Parts is behind the active stage, so the rail offers it
    await userEvent.click(screen.getByRole('button', { name: /parts/i }))
    expect(await screen.findByRole('heading', { level: 2, name: /^parts$/i })).toBeInTheDocument()
  })

  it('does not offer stages ahead of the active one', async () => {
    apiMock.mockResolvedValue(makeDetail([makePart('p1', 'draft')]))
    renderWizard()
    await screen.findByRole('heading', { level: 2, name: /^parts$/i })
    expect(screen.getByRole('button', { name: /assembly/i })).toBeDisabled()
  })
})
