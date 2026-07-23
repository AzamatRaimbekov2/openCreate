// apps/web/src/modules/Assets3D/components/AssemblyStage.test.tsx
// Behavior of the assembly stage — the wizard's last act and the one that hands
// the user the file they paid for.
//
// THE LOAD-BEARING CONSTRAINT: these tests run in jsdom, which has no WebGL, so
// `isWebGLAvailable()` is false and the stage renders its POSTER FALLBACK. That is
// not a limitation being worked around — it is the ADR's required no-WebGL path,
// and asserting it here is exactly what the plan calls for. Real WebGL is NEVER
// rendered in Vitest.
//
// The other thing under test is Fix FG-3: a part cites its mesh by ID, and the GLB
// url lives on THAT generation's mediaUrls[0]. A part whose mesh generation is
// still processing, failed, or produced no media must be SKIPPED — never turned
// into a url derived from the bare id.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Asset3dDetail, Asset3dPart, Generation, PartStatus } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'
import { AssemblyStage } from './AssemblyStage'
import { useWizardStore } from '../model/wizardStore'
import 'shared/config/i18n'

vi.mock('shared/libs/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared/libs/apiClient')>()
  return { ...actual, api: vi.fn() }
})

const apiMock = vi.mocked(api)

function makePart(id: string, overrides: Partial<Asset3dPart> = {}): Asset3dPart {
  const status: PartStatus = overrides.status ?? 'ready'
  return {
    id,
    assetId: 'asset1',
    name: `Part ${id}`,
    description: '',
    sortOrder: 0,
    imageGenerationId: `img-${id}`,
    meshGenerationId: `mesh-${id}`,
    transform: null,
    status,
    createdAt: '2026-07-20T10:00:00.000Z',
    ...overrides,
  }
}

function makeGeneration(id: string, status: Generation['status'], mediaUrls: string[]): Generation {
  return {
    id,
    type: id.startsWith('mesh') ? 'model3d' : 'image',
    mode: 'image',
    status,
    prompt: '',
    modelId: 'trellis-2',
    params: {},
    costCredits: 6,
    mediaUrls,
    errorMessage: null,
    createdAt: '2026-07-20T10:00:00.000Z',
    completedAt: null,
  }
}

const detail: Asset3dDetail = {
  asset: {
    id: 'asset1',
    title: 'Iron Captain',
    conceptImageUrl: '/media/concept1.png',
    createdAt: '2026-07-20T10:00:00.000Z',
  },
  parts: [],
}

// Route the mocked api by path: the aggregate, then each cited generation by id.
function mockApi(parts: Asset3dPart[], generations: Record<string, Generation>) {
  apiMock.mockImplementation((path: string) => {
    if (path === '/api/assets3d/asset1') {
      return Promise.resolve({ ...detail, parts })
    }
    const match = /^\/api\/generations\/(.+)$/.exec(path)
    const found = match?.[1] === undefined ? undefined : generations[match[1]]
    if (found) return Promise.resolve(found)
    return Promise.reject(new Error(`unexpected path ${path}`))
  })
}

function renderStage(parts: Asset3dPart[], generations: Record<string, Generation> = {}) {
  mockApi(parts, generations)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <AssemblyStage assetId="asset1" parts={parts} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  apiMock.mockReset()
  useWizardStore.getState().reset()
  // GLTFLoader fetches the GLB itself; jsdom has no network, so fail it cleanly
  // rather than leaving an unhandled rejection in the run.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('no network in jsdom'))),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AssemblyStage — no-WebGL fallback', () => {
  it('renders the part posters instead of a canvas', async () => {
    // THE required assertion: jsdom has no WebGL, so the viewer degrades to the
    // extraction posters. This path is also what covers crawlers and OG bots.
    const parts = [makePart('p1'), makePart('p2')]
    renderStage(parts, {
      'mesh-p1': makeGeneration('mesh-p1', 'succeeded', ['/media/p1.glb']),
      'mesh-p2': makeGeneration('mesh-p2', 'succeeded', ['/media/p2.glb']),
      'img-p1': makeGeneration('img-p1', 'succeeded', ['/media/p1.png']),
      'img-p2': makeGeneration('img-p2', 'succeeded', ['/media/p2.png']),
    })

    expect(await screen.findByAltText('Extraction of Part p1')).toBeInTheDocument()
    expect(screen.getByAltText('Extraction of Part p2')).toBeInTheDocument()
  })

  it('explains why the 3D preview is missing rather than showing a dead frame', async () => {
    renderStage([makePart('p1')], {
      'mesh-p1': makeGeneration('mesh-p1', 'succeeded', ['/media/p1.glb']),
      'img-p1': makeGeneration('img-p1', 'succeeded', ['/media/p1.png']),
    })

    expect(await screen.findByText(/3D preview unavailable/i)).toBeInTheDocument()
  })

  it('never mounts a WebGL canvas in jsdom', async () => {
    const { container } = renderStage([makePart('p1')], {
      'mesh-p1': makeGeneration('mesh-p1', 'succeeded', ['/media/p1.glb']),
      'img-p1': makeGeneration('img-p1', 'succeeded', ['/media/p1.png']),
    })
    await screen.findByText(/3D preview unavailable/i)

    expect(container.querySelector('canvas')).toBeNull()
  })
})

describe('AssemblyStage — GLB url resolution (plan Fix FG-3)', () => {
  it('skips a part whose mesh generation is still processing', async () => {
    // Never derive a url from the bare meshGenerationId: until the generation
    // says succeeded there is no GLB behind it.
    const parts = [makePart('p1'), makePart('p2')]
    renderStage(parts, {
      'mesh-p1': makeGeneration('mesh-p1', 'succeeded', ['/media/p1.glb']),
      'mesh-p2': makeGeneration('mesh-p2', 'processing', []),
      'img-p1': makeGeneration('img-p1', 'succeeded', ['/media/p1.png']),
      'img-p2': makeGeneration('img-p2', 'succeeded', ['/media/p2.png']),
    })

    expect(await screen.findByAltText('Extraction of Part p1')).toBeInTheDocument()
    expect(screen.queryByAltText('Extraction of Part p2')).not.toBeInTheDocument()
  })

  it('skips a part whose mesh generation failed', async () => {
    const parts = [makePart('p1'), makePart('p2')]
    renderStage(parts, {
      'mesh-p1': makeGeneration('mesh-p1', 'succeeded', ['/media/p1.glb']),
      'mesh-p2': makeGeneration('mesh-p2', 'failed', []),
      'img-p1': makeGeneration('img-p1', 'succeeded', ['/media/p1.png']),
      'img-p2': makeGeneration('img-p2', 'succeeded', ['/media/p2.png']),
    })

    expect(await screen.findByAltText('Extraction of Part p1')).toBeInTheDocument()
    expect(screen.queryByAltText('Extraction of Part p2')).not.toBeInTheDocument()
  })

  it('skips a succeeded mesh that carries no media', async () => {
    // A valid-but-wrong-shape generation. mediaUrls[0] is the url; without it
    // there is nothing to load, and an undefined url must not reach the loader.
    renderStage([makePart('p1')], {
      'mesh-p1': makeGeneration('mesh-p1', 'succeeded', []),
      'img-p1': makeGeneration('img-p1', 'succeeded', ['/media/p1.png']),
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(/no part mesh finished/i)
  })
})

describe('AssemblyStage — the 4 UI states', () => {
  it('shows an empty state when the asset has no parts', async () => {
    renderStage([])

    expect(await screen.findByText(/nothing to assemble yet/i)).toBeInTheDocument()
  })

  it('shows a calm error, with no retry, when no part cites a mesh', async () => {
    // Valid data in an impossible shape for this stage — calm, not a failure the
    // user can retry their way out of.
    renderStage([makePart('p1', { meshGenerationId: null, status: 'extracted' })])

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/none of these parts has a mesh yet/i)
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument()
  })

  it('shows a loading skeleton while the cited mesh generations resolve', async () => {
    apiMock.mockImplementation((path: string) => {
      if (path === '/api/assets3d/asset1') {
        return Promise.resolve({ ...detail, parts: [makePart('p1')] })
      }
      return new Promise(() => {})
    })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <AssemblyStage assetId="asset1" parts={[makePart('p1')]} />
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(container.querySelectorAll('.animate-skeleton').length).toBeGreaterThan(0)
    })
  })

  it('reports how many parts actually loaded', async () => {
    // In jsdom no GLB can load, so this reads 0 of 1 — the honest number. It is
    // the same counter that tells a real user a part is missing from the export.
    renderStage([makePart('p1')], {
      'mesh-p1': makeGeneration('mesh-p1', 'succeeded', ['/media/p1.glb']),
      'img-p1': makeGeneration('img-p1', 'succeeded', ['/media/p1.png']),
    })

    expect(await screen.findByText(/0 of 1 parts loaded/i)).toBeInTheDocument()
  })
})

describe('AssemblyStage — export', () => {
  it('disables export while no part has loaded', async () => {
    // Nothing loads in jsdom, so the button must be off: exporting an empty
    // group would hand the user a GLB that opens blank in Blender.
    renderStage([makePart('p1')], {
      'mesh-p1': makeGeneration('mesh-p1', 'succeeded', ['/media/p1.glb']),
      'img-p1': makeGeneration('img-p1', 'succeeded', ['/media/p1.png']),
    })

    expect(await screen.findByRole('button', { name: /export glb/i })).toBeDisabled()
  })
})

describe('AssemblyStage — gizmo', () => {
  it('offers the three transform modes and switches between them', async () => {
    renderStage([makePart('p1')], {
      'mesh-p1': makeGeneration('mesh-p1', 'succeeded', ['/media/p1.glb']),
      'img-p1': makeGeneration('img-p1', 'succeeded', ['/media/p1.png']),
    })
    await screen.findByRole('button', { name: /^move$/i })

    await userEvent.click(screen.getByRole('button', { name: /^rotate$/i }))

    expect(useWizardStore.getState().gizmoMode).toBe('rotate')
  })

  it('starts in translate mode, because placing a part comes first', async () => {
    renderStage([makePart('p1')], {
      'mesh-p1': makeGeneration('mesh-p1', 'succeeded', ['/media/p1.glb']),
      'img-p1': makeGeneration('img-p1', 'succeeded', ['/media/p1.png']),
    })
    await screen.findByRole('button', { name: /^move$/i })

    expect(useWizardStore.getState().gizmoMode).toBe('translate')
  })
})

describe('AssemblyStage — selection', () => {
  it('selects a part from the fallback grid, so the gizmo has a target', async () => {
    renderStage([makePart('p1'), makePart('p2')], {
      'mesh-p1': makeGeneration('mesh-p1', 'succeeded', ['/media/p1.glb']),
      'mesh-p2': makeGeneration('mesh-p2', 'succeeded', ['/media/p2.glb']),
      'img-p1': makeGeneration('img-p1', 'succeeded', ['/media/p1.png']),
      'img-p2': makeGeneration('img-p2', 'succeeded', ['/media/p2.png']),
    })
    const select = await screen.findByRole('button', { name: /select part p2/i })

    await userEvent.click(select)

    expect(useWizardStore.getState().selectedPartId).toBe('p2')
  })
})
