// apps/web/src/modules/Cinema/components/FilmEditor.test.tsx
// The editor's export contract, CLIENT-side (client-side-export ADR). The server
// render is retired from the path, so the old server-render tests (reload
// recovery, the 409 concurrency guard, poll-wedge) are GONE — they describe
// behaviours that no longer exist. What replaces them:
//   * the export button runs the CLIENT pipeline (`useFilmExport`, mocked here —
//     never real WebCodecs) when the film is ready;
//   * the CLIENT validation still refuses a not-ready film with the SAME named
//     reasons (a clip generating/failed, no shots) and does NOT start;
//   * progress renders, cancel tears down, and an unsupported browser gets a calm
//     message.
// The first group (composer/layout) is unchanged — it never touched export.
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
import type { CatalogVideoModel, FilmDetail, Generation, Shot } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'
import { useToastStore } from 'shared/ui'
import { FilmEditor } from './FilmEditor'
import 'shared/config/i18n'

vi.mock('shared/libs/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared/libs/apiClient')>()
  return { ...actual, api: vi.fn() }
})

const apiMock = vi.mocked(api)

// The CLIENT pipeline is browser-only (WebCodecs) — mock it so the tests drive the
// state machine (idle/running/done/error, isSupported) without a real encode. The
// export BLOCK (computeExportBlock over the generation cache) stays REAL.
const { exportRef } = vi.hoisted(() => ({
  exportRef: {
    current: {
      state: 'idle' as 'idle' | 'running' | 'done' | 'error',
      progress: 0,
      error: null as string | null,
      isSupported: true,
      startExport: vi.fn(async () => undefined),
      cancel: vi.fn(),
    },
  },
}))
vi.mock('../model/useFilmExport', () => ({ useFilmExport: () => exportRef.current }))

function makeShot(overrides: Partial<Shot> = {}): Shot {
  return {
    id: 'shot1',
    filmId: 'film1',
    orderIndex: 1,
    generationId: null,
    prompt: 'a lighthouse in a storm',
    promptPreset: null,
    entityRefs: [],
    referenceImages: [],
    modelId: null,
    aspectRatio: null,
    durationMs: 5000,
    trimStartMs: 0,
    transition: 'none',
    transitionMs: 0,
    title: null,
    voiceover: null,
    audio: false,
    createdAt: '2026-07-09T10:00:00.000Z',
    ...overrides,
  }
}

function makeDetail(shots: Shot[]): FilmDetail {
  return {
    film: {
      id: 'film1',
      title: 'Neon Drift',
      aspectRatio: '16:9',
      defaultStyleId: null,
      templateId: null,
      batchId: null,
      coverUrl: null,
      createdAt: '2026-07-09T10:00:00.000Z',
      updatedAt: '2026-07-09T10:00:00.000Z',
    },
    shots,
    audio: [],
    latestRender: null,
  }
}

function gen(overrides: Partial<Generation>): Generation {
  return {
    id: 'gen1',
    type: 'video',
    mode: 'text',
    status: 'succeeded',
    prompt: 'x',
    modelId: 'wan-2-7',
    params: {},
    costCredits: 85,
    mediaUrls: ['/media/gen1.mp4'],
    errorMessage: null,
    createdAt: '2026-07-09T10:00:00.000Z',
    completedAt: '2026-07-09T10:00:30.000Z',
    ...overrides,
  }
}

// Route the film detail + the per-clip generation fetches (the block reads these).
function routeApi(detail: FilmDetail, generations: Record<string, Generation> = {}) {
  apiMock.mockImplementation((path: string) => {
    const match = /\/api\/generations\/([^/?]+)/.exec(path)
    if (match) {
      const found = generations[match[1] ?? '']
      return found
        ? (Promise.resolve(found) as never)
        : (Promise.reject(new Error('gone')) as never)
    }
    return Promise.resolve(detail) as never
  })
}

const videoModel: CatalogVideoModel = {
  id: 'wan-2-7',
  name: 'Wan 2.7',
  providerLabel: 'Alibaba',
  air: 'wan:2.7@1',
  tier: 'pro',
  type: 'video',
  supportsImageInput: false,
  referenceMode: 'subject',
  aspectRatios: ['16:9', '9:16'],
  durationOptions: [5, 10],
  creditsByDuration: { '5': 85, '10': 135 },
}

function renderEditor() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <FilmEditor filmId="film1" models={[videoModel]} />,
  })
  const libraryStub = createRoute({
    getParentRoute: () => rootRoute,
    path: '/cinema',
    component: () => null,
  })
  const canvasRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/canvas/$canvasId',
    component: () => {
      const { canvasId } = canvasRoute.useParams()
      return <div>canvas-stub-{canvasId}</div>
    },
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, libraryStub, canvasRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

const exportButton = () => screen.getByRole('button', { name: /render mp4|собрать mp4/i })

// Routes the film detail + per-clip generation fetches (like `routeApi`) PLUS
// the two Canvas endpoints Export-to-Canvas drives — POST /api/canvases and
// PATCH /api/canvases/:id — so the export flow needs no `modules/Canvas` mock:
// `useCreateCanvas`/`saveCanvas` call the SAME `api()` these tests already mock.
function routeApiWithCanvas(
  detail: FilmDetail,
  generations: Record<string, Generation> = {},
  createdCanvasId = 'canvas1',
) {
  apiMock.mockImplementation(((path: string, init?: RequestInit) => {
    if (path === '/api/canvases' && init?.method === 'POST') {
      return Promise.resolve({
        id: createdCanvasId,
        title: 'Neon Drift — Canvas',
        createdAt: '2026-08-04T00:00:00.000Z',
        updatedAt: '2026-08-04T00:00:00.000Z',
      })
    }
    if (path === `/api/canvases/${createdCanvasId}` && init?.method === 'PATCH') {
      return Promise.resolve({
        id: createdCanvasId,
        title: 'Neon Drift — Canvas',
        createdAt: '2026-08-04T00:00:00.000Z',
        updatedAt: '2026-08-04T00:00:00.000Z',
        viewport: { x: 0, y: 0, zoom: 1 },
        nodes: [],
        edges: [],
      })
    }
    const genMatch = /\/api\/generations\/([^/?]+)/.exec(path)
    if (genMatch) {
      const found = generations[genMatch[1] ?? '']
      return found ? Promise.resolve(found) : Promise.reject(new Error('gone'))
    }
    return Promise.resolve(detail)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches apiMock's own generic signature
  }) as any)
}

const openExportToCanvas = async (user: ReturnType<typeof userEvent.setup>) => {
  // findByRole (not getByRole after an unrelated await): the ⋯ menu only
  // appears once the film has actually LOADED — the "Render mp4" button is
  // present even during the pending skeleton state, so waiting on it alone
  // is not enough to know the actions menu has mounted.
  await user.click(await screen.findByRole('button', { name: /actions|действия/i }))
  await user.click(screen.getByRole('menuitem', { name: /export to canvas|экспорт в холст/i }))
}

beforeEach(() => {
  apiMock.mockReset()
  useToastStore.getState().clear()
  exportRef.current = {
    state: 'idle',
    progress: 0,
    error: null,
    isSupported: true,
    startExport: vi.fn(async () => undefined),
    cancel: vi.fn(),
  }
})

describe('FilmEditor', () => {
  it('opens with the FIRST shot in the composer — no tile click required', async () => {
    apiMock.mockResolvedValue(
      makeDetail([
        makeShot({ id: 'a', orderIndex: 1, prompt: 'a lighthouse in a storm' }),
        makeShot({ id: 'b', orderIndex: 2, prompt: 'a fox in the snow' }),
      ]),
    )
    renderEditor()
    expect(await screen.findByDisplayValue('a lighthouse in a storm')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('a fox in the snow')).not.toBeInTheDocument()
  })

  it('places the composer in the RIGHT column — after the montage in DOM (v8 70/30)', async () => {
    // v8 layout (owner 2026-07-24): two columns — left 70% montage (preview +
    // timeline), right 30% composer. The montage column (with the timeline) is
    // the first grid child, so the composer still FOLLOWS the timeline in the DOM.
    apiMock.mockResolvedValue(
      makeDetail([makeShot({ id: 'a', prompt: 'a lighthouse in a storm' })]),
    )
    renderEditor()
    const composer = await screen.findByRole('region', { name: 'Shot' })
    const timeline = screen.getByRole('region', { name: 'Timeline' })
    expect(
      timeline.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('renders the composer as a column, NOT a fixed dock (v8 70/30)', async () => {
    // The floating bottom dock is retired: the composer lives in an <aside>
    // right column, in normal flow — never `position: fixed`.
    apiMock.mockResolvedValue(
      makeDetail([makeShot({ id: 'a', prompt: 'a lighthouse in a storm' })]),
    )
    renderEditor()
    const composer = await screen.findByRole('region', { name: 'Shot' })
    expect(composer.closest('.fixed')).toBeNull()
    expect(composer.closest('aside')).not.toBeNull()
  })

  it('keeps the select hint when the film has no shots', async () => {
    apiMock.mockResolvedValue(makeDetail([]))
    renderEditor()
    expect(await screen.findByText(/add one from the timeline/i)).toBeInTheDocument()
  })
})

describe('FilmEditor — client export', () => {
  it('runs the client pipeline when the film is ready', async () => {
    // A title-card film is renderable with no clip to resolve → ready immediately.
    routeApi(
      makeDetail([
        makeShot({ id: 'a', generationId: null, title: { text: 'The End', position: 'center' } }),
      ]),
    )
    renderEditor()
    await screen.findByRole('button', { name: /render mp4|собрать mp4/i })

    await userEvent.click(exportButton())

    expect(exportRef.current.startExport).toHaveBeenCalledTimes(1)
  })

  it('refuses a film whose clip is still generating, and does NOT start', async () => {
    routeApi(makeDetail([makeShot({ id: 'a', generationId: 'gen-a' })]), {
      'gen-a': gen({ id: 'gen-a', status: 'processing' }),
    })
    renderEditor()
    await screen.findByRole('button', { name: /render mp4|собрать mp4/i })

    await userEvent.click(exportButton())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/still generating|генерир/i)
    expect(exportRef.current.startExport).not.toHaveBeenCalled()
  })

  it('tells the user to REGENERATE when the clip failed', async () => {
    routeApi(makeDetail([makeShot({ id: 'a', generationId: 'gen-a' })]), {
      'gen-a': gen({ id: 'gen-a', status: 'failed', mediaUrls: [] }),
    })
    renderEditor()
    await screen.findByRole('button', { name: /render mp4|собрать mp4/i })

    await userEvent.click(exportButton())

    expect(await screen.findByText(/regenerate|сгенерир/i)).toBeInTheDocument()
    expect(exportRef.current.startExport).not.toHaveBeenCalled()
  })

  it('refuses a film with nothing to render, and does NOT start', async () => {
    // A shot with no clip AND no title is not renderable → the "no shots" refusal.
    routeApi(makeDetail([makeShot({ id: 'a', generationId: null, title: null, prompt: '' })]))
    renderEditor()
    await screen.findByRole('button', { name: /render mp4|собрать mp4/i })

    await userEvent.click(exportButton())
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(exportRef.current.startExport).not.toHaveBeenCalled()
  })

  it('shows progress while the export is running', async () => {
    exportRef.current.state = 'running'
    exportRef.current.progress = 42
    routeApi(
      makeDetail([
        makeShot({ id: 'a', generationId: null, title: { text: 'Hi', position: 'center' } }),
      ]),
    )
    renderEditor()

    expect(await screen.findByText(/42%/)).toBeInTheDocument()
  })

  it('cancels a running export cleanly', async () => {
    exportRef.current.state = 'running'
    exportRef.current.progress = 10
    routeApi(
      makeDetail([
        makeShot({ id: 'a', generationId: null, title: { text: 'Hi', position: 'center' } }),
      ]),
    )
    renderEditor()

    await userEvent.click(await screen.findByRole('button', { name: /cancel|отмен/i }))
    expect(exportRef.current.cancel).toHaveBeenCalledTimes(1)
  })

  it('shows a calm message and disables export where it is unsupported', async () => {
    exportRef.current.isSupported = false
    routeApi(
      makeDetail([
        makeShot({ id: 'a', generationId: null, title: { text: 'Hi', position: 'center' } }),
      ]),
    )
    renderEditor()

    expect(
      await screen.findByText(/can't export video here|не умеет экспортировать/i),
    ).toBeInTheDocument()
    expect(exportButton()).toBeDisabled()
  })

  it('offers a jump to the blocking shot, and selects it', async () => {
    routeApi(
      makeDetail([
        makeShot({
          id: 'a',
          orderIndex: 1,
          generationId: null,
          title: { text: 'Intro', position: 'center' },
        }),
        makeShot({ id: 'b', orderIndex: 2, generationId: 'gen-b', prompt: 'second' }),
      ]),
      { 'gen-b': gen({ id: 'gen-b', status: 'processing' }) },
    )
    renderEditor()
    await screen.findByRole('button', { name: /render mp4|собрать mp4/i })

    await userEvent.click(exportButton())
    await screen.findByRole('alert')
    await userEvent.click(screen.getByRole('button', { name: /show me|показать/i }))

    expect(await screen.findByDisplayValue('second')).toBeInTheDocument()
  })
})

describe('FilmEditor — export to Canvas', () => {
  it('creates a canvas from the film and navigates to it', async () => {
    const user = userEvent.setup()
    routeApiWithCanvas(
      makeDetail([makeShot({ id: 'a', orderIndex: 1, generationId: 'gen-a', prompt: 'p1' })]),
      { 'gen-a': gen({ id: 'gen-a' }) },
    )
    renderEditor()
    await screen.findByRole('button', { name: /render mp4|собрать mp4/i })

    await openExportToCanvas(user)

    expect(await screen.findByText('canvas-stub-canvas1')).toBeInTheDocument()
    expect(apiMock).toHaveBeenCalledWith('/api/canvases', {
      method: 'POST',
      body: JSON.stringify({ title: 'Neon Drift — Canvas' }),
    })
    expect(apiMock).toHaveBeenCalledWith(
      '/api/canvases/canvas1',
      expect.objectContaining({ method: 'PATCH' }),
    )
  })

  it('shows an error toast and does NOT navigate when the film has nothing exportable', async () => {
    const user = userEvent.setup()
    routeApiWithCanvas(makeDetail([makeShot({ id: 'a', orderIndex: 1, generationId: null })]))
    renderEditor()
    await screen.findByRole('button', { name: /render mp4|собрать mp4/i })

    await openExportToCanvas(user)

    expect(useToastStore.getState().toasts).toHaveLength(1)
    expect(useToastStore.getState().toasts[0]?.variant).toBe('error')
    expect(apiMock).not.toHaveBeenCalledWith('/api/canvases', expect.anything())
    expect(screen.queryByText(/canvas-stub-/)).not.toBeInTheDocument()
  })

  it('shows an error toast when the canvas create call fails', async () => {
    const user = userEvent.setup()
    const detail = makeDetail([
      makeShot({ id: 'a', orderIndex: 1, generationId: 'gen-a', prompt: 'p1' }),
    ])
    apiMock.mockImplementation(((path: string) => {
      if (path === '/api/canvases') return Promise.reject(new Error('down'))
      const genMatch = /\/api\/generations\/([^/?]+)/.exec(path)
      if (genMatch) return Promise.resolve(gen({ id: 'gen-a' }))
      return Promise.resolve(detail)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches apiMock's own generic signature
    }) as any)
    renderEditor()
    await screen.findByRole('button', { name: /render mp4|собрать mp4/i })

    await openExportToCanvas(user)

    await waitFor(() => expect(useToastStore.getState().toasts).toHaveLength(1))
    expect(useToastStore.getState().toasts[0]?.variant).toBe('error')
    expect(screen.queryByText(/canvas-stub-/)).not.toBeInTheDocument()
  })
})
