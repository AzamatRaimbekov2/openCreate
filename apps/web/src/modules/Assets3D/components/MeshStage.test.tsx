// apps/web/src/modules/Assets3D/components/MeshStage.test.tsx
// The heaviest per-part spend. OWNER DECISION 2026-07-20: unlike extraction,
// a single mesh IS gated by the spend alertdialog — mis-click parity, because
// one careless tap here costs more than the whole extraction pass. So the two
// load-bearing assertions are:
//   1. the bare click must NOT mutate — the dialog opens, restates the TIER's
//      credit number, and only its confirm pill calls the API;
//   2. the tier the user picked is the tier that is charged and sent.
// Plus the usual paid-surface duties: a null price disables, a failed mesh says
// so in our words with the refund chip, and an unextracted part cannot be meshed.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Asset3dPart, CatalogModel, Generation, PartStatus } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'
import { MeshStage } from './MeshStage'
import { useWizardStore } from '../model/wizardStore'
import 'shared/config/i18n'

vi.mock('shared/libs/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared/libs/apiClient')>()
  return { ...actual, api: vi.fn() }
})

const apiMock = vi.mocked(api)

// Two tiers so the picker has a real choice — and so "the picked tier is the
// charged tier" is a claim the test can actually falsify.
const MODELS: CatalogModel[] = [
  {
    id: 'trellis',
    type: 'model3d',
    name: 'TRELLIS',
    providerLabel: 'TRELLIS',
    air: 'runware:501@1',
    tier: 'fast',
    // catalogBase requires both, even for model3d rows (a mesh has no aspect
    // ratio in practice — the catalog just does not special-case the base)
    supportsImageInput: true,
    aspectRatios: ['1:1'],
    credits: 20,
  },
  {
    id: 'hunyuan3d',
    type: 'model3d',
    name: 'Hunyuan3D',
    providerLabel: 'Hunyuan3D-2',
    air: 'runware:502@1',
    tier: 'quality',
    supportsImageInput: true,
    aspectRatios: ['1:1'],
    credits: 45,
  },
]

function makePart(id: string, name: string, status: PartStatus): Asset3dPart {
  return {
    id,
    assetId: 'a1',
    name,
    description: '',
    sortOrder: 0,
    imageGenerationId: status === 'draft' ? null : `img-${id}`,
    meshGenerationId: status === 'meshing' || status === 'ready' ? `mesh-${id}` : null,
    transform: null,
    status,
    createdAt: '2026-07-20T10:00:00.000Z',
  }
}

function makeGeneration(overrides: Partial<Generation> = {}): Generation {
  return {
    id: 'mesh-p1',
    type: 'model3d',
    mode: 'image',
    status: 'succeeded',
    prompt: 'helmet',
    modelId: 'trellis',
    params: {},
    costCredits: 20,
    mediaUrls: ['/media/part1.glb'],
    errorMessage: null,
    errorCode: null,
    createdAt: '2026-07-20T10:00:00.000Z',
    completedAt: '2026-07-20T10:00:30.000Z',
    ...overrides,
  }
}

function routeApi(generations: Record<string, Generation>) {
  apiMock.mockImplementation((path: string) => {
    const match = /^\/api\/generations\/(.+)$/.exec(path)
    const generation = match ? generations[match[1] ?? ''] : undefined
    if (generation) return Promise.resolve(generation) as never
    return Promise.resolve({}) as never
  })
}

function renderStage(parts: Asset3dPart[], models: CatalogModel[] = MODELS) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MeshStage assetId="a1" parts={parts} models={models} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  apiMock.mockReset()
  useWizardStore.getState().reset()
})

describe('MeshStage', () => {
  it('explains itself when no part has been extracted yet', () => {
    routeApi({})
    renderStage([])
    expect(screen.getByRole('heading', { name: /nothing to mesh/i })).toBeInTheDocument()
  })

  it('prints the first tier price on the button before the click', () => {
    routeApi({})
    renderStage([makePart('p1', 'Helmet', 'extracted')])
    expect(screen.getByRole('button', { name: /create mesh · 20 cr/i })).toBeEnabled()
  })

  it('does not mutate on the bare click — the mesh spend is confirmed first', async () => {
    const user = userEvent.setup()
    routeApi({})
    renderStage([makePart('p1', 'Helmet', 'extracted')])

    await user.click(screen.getByRole('button', { name: /create mesh · 20 cr/i }))

    // The whole point of the owner's decision: one tap costs nothing
    expect(apiMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/mesh'),
      expect.anything(),
    )
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent(/20 credits/i)
  })

  it('charges the tier the user picked, and closes the dialog before mutating', async () => {
    const user = userEvent.setup()
    routeApi({})
    renderStage([makePart('p1', 'Helmet', 'extracted')])

    // Switch to the expensive tier through the picker
    await user.click(screen.getByRole('button', { name: /mesh tier/i }))
    await user.click(await screen.findByRole('option', { name: /hunyuan3d/i }))

    await user.click(screen.getByRole('button', { name: /create mesh · 45 cr/i }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: /create mesh · 45 cr/i }))

    expect(apiMock).toHaveBeenCalledWith('/api/assets3d/a1/parts/p1/mesh', {
      method: 'POST',
      body: JSON.stringify({ modelId: 'hunyuan3d' }),
    })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('cannot mesh a part that has not been extracted', () => {
    routeApi({})
    // A MIXED grid is where this matters: one part is ready to spend on, its
    // sibling is not, and the difference has to be legible per plate
    renderStage([makePart('p1', 'Helmet', 'extracted'), makePart('p2', 'Pauldron', 'draft')])

    // The honest reason, not a dead control
    expect(screen.getByText(/extract this part first/i)).toBeInTheDocument()
    // Exactly one spend button — the extracted part's; the draft one has none
    expect(screen.getAllByRole('button', { name: /create mesh/i })).toHaveLength(1)
  })

  it('offers no tier — and no spend — while the catalog is empty', () => {
    routeApi({})
    renderStage([makePart('p1', 'Helmet', 'extracted')], [])
    expect(screen.getByText(/no mesh tiers are available/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /create mesh/i })).not.toBeInTheDocument()
  })

  it('shows a failed mesh as failed and refunded, in our own words', async () => {
    routeApi({
      'mesh-p1': makeGeneration({
        status: 'failed',
        mediaUrls: [],
        errorCode: 'provider_error',
      }),
    })
    renderStage([makePart('p1', 'Helmet', 'meshing')])

    expect(await screen.findByText(/provider/i)).toBeInTheDocument()
    expect(screen.getByText(/credits refunded/i)).toBeInTheDocument()
  })

  it('offers the way forward once every part has a mesh', async () => {
    routeApi({ 'mesh-p1': makeGeneration() })
    renderStage([makePart('p1', 'Helmet', 'ready')])
    expect(await screen.findByRole('button', { name: /go to assembly/i })).toBeEnabled()
  })
})
