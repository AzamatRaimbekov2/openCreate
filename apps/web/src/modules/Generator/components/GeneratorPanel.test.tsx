// apps/web/src/modules/Generator/components/GeneratorPanel.test.tsx
// Behavior (plan Task 16): the panel renders prompt/model select/aspect control
// filtered by model/duration pills (video only)/cost label from the mocked
// catalog; the i2v upload appears only for supporting models; submit is gated
// on prompt length and posts the exact CreateGenerationInput; an
// insufficient-credits failure surfaces inline with a link to /pricing.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CatalogModel, Generation } from '@opencreate/contracts'
import { ApiClientError, api } from 'shared/libs/apiClient'
import { useGeneratorStore } from '../model/generatorStore'
import { GeneratorPanel } from './GeneratorPanel'
// i18n init — the panel renders localized labels itself
import 'shared/config/i18n'

// Mock ONLY api(); the real ApiClientError class must survive for instanceof
vi.mock('shared/libs/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared/libs/apiClient')>()
  return { ...actual, api: vi.fn() }
})

const apiMock = vi.mocked(api)

const models: CatalogModel[] = [
  {
    id: 'flux-schnell',
    type: 'image',
    name: 'Flash',
    providerLabel: 'FLUX schnell',
    air: 'runware:100@1',
    tier: 'fast',
    supportsImageInput: false,
    aspectRatios: ['16:9', '1:1', '9:16'],
    credits: 1,
  },
  {
    id: 'pixverse-v6',
    type: 'video',
    name: 'Swift',
    providerLabel: 'PixVerse V6',
    air: 'pixverse:1@8',
    tier: 'standard',
    supportsImageInput: true,
    aspectRatios: ['16:9', '1:1', '9:16'],
    durationOptions: [5, 8],
    creditsByDuration: { '5': 35, '8': 56 },
  },
  {
    id: 'minimax-hailuo',
    type: 'video',
    name: 'Motion',
    providerLabel: 'MiniMax Hailuo 2.3',
    air: 'minimax:4@1',
    tier: 'standard',
    supportsImageInput: true,
    aspectRatios: ['16:9'],
    durationOptions: [6, 10],
    creditsByDuration: { '6': 35, '10': 60 },
  },
]

const createdGeneration: Generation = {
  id: 'gen_1',
  type: 'video',
  mode: 'text',
  status: 'processing',
  prompt: 'ocean waves',
  modelId: 'pixverse-v6',
  params: { aspectRatio: '1:1', duration: 5 },
  costCredits: 35,
  mediaUrls: [],
  progress: null,
  errorMessage: null,
  createdAt: '2026-07-06T10:00:00.000Z',
  completedAt: null,
}

// Default happy-path api: catalog GET + generations POST
function mockApiHappyPath() {
  apiMock.mockImplementation((path) => {
    if (path === '/api/catalog') return Promise.resolve({ models })
    if (path === '/api/generations') return Promise.resolve(createdGeneration)
    return Promise.reject(new Error(`unexpected call ${String(path)}`))
  })
}

// The panel renders a typed <Link to="/pricing"> since Task 20, so it needs
// router CONTEXT. RouterContextProvider (not RouterProvider) renders children
// synchronously — the sync loading-state assertions below stay valid.
function buildTestRouter() {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/', component: () => null }),
    createRoute({ getParentRoute: () => rootRoute, path: '/pricing', component: () => null }),
  ])
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
}

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return {
    queryClient,
    ...render(
      <RouterContextProvider router={buildTestRouter()}>
        <QueryClientProvider client={queryClient}>
          <GeneratorPanel />
        </QueryClientProvider>
      </RouterContextProvider>,
    ),
  }
}

beforeEach(() => {
  apiMock.mockReset()
  // Module-level singleton store — pristine state per test
  useGeneratorStore.setState(useGeneratorStore.getInitialState(), true)
})

describe('GeneratorPanel', () => {
  it('shows skeletons while the catalog loads', () => {
    apiMock.mockReturnValue(new Promise(() => {}))
    const { container } = renderPanel()
    expect(container.querySelector('.animate-skeleton')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /generate/i })).not.toBeInTheDocument()
  })

  it('shows a retry error state when the catalog fails to load', async () => {
    apiMock.mockRejectedValueOnce(new ApiClientError('internal_error', 'boom', 500))
    renderPanel()
    const retry = await screen.findByRole('button', { name: /try again/i })
    mockApiHappyPath()
    await userEvent.click(retry)
    expect(await screen.findByLabelText(/prompt/i)).toBeInTheDocument()
  })

  it('renders the prompt textarea and the model select from the catalog', async () => {
    mockApiHappyPath()
    renderPanel()
    expect(await screen.findByLabelText(/prompt/i)).toBeInTheDocument()
    // The model select trigger shows the auto-selected first image model
    const trigger = screen.getByRole('button', { name: /flash/i })
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox')
    // Opening lists ALL catalog models grouped Images/Video (no type pre-filter)
    await userEvent.click(trigger)
    const listbox = screen.getByRole('listbox', { name: /model/i })
    expect(within(listbox).getByRole('option', { name: /flash/i })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(within(listbox).getByRole('option', { name: /swift/i })).toBeInTheDocument()
    expect(within(listbox).getByRole('option', { name: /motion/i })).toBeInTheDocument()
  })

  it('filters aspect options by the selected model', async () => {
    mockApiHappyPath()
    renderPanel()
    await screen.findByLabelText(/prompt/i)
    const aspectGroup = screen.getByRole('group', { name: /aspect ratio/i })
    // Flash (image) offers three ratios
    expect(within(aspectGroup).getAllByRole('button')).toHaveLength(3)
    // Pick Motion via the model select — it offers only 16:9 (and flips to video)
    await userEvent.click(screen.getByRole('button', { name: /flash/i }))
    await userEvent.click(screen.getByRole('option', { name: /motion/i }))
    expect(within(aspectGroup).getAllByRole('button')).toHaveLength(1)
    expect(within(aspectGroup).getByRole('button', { name: '16:9' })).toBeInTheDocument()
  })

  it('shows duration pills only for video models and the matching cost label', async () => {
    mockApiHappyPath()
    renderPanel()
    await screen.findByLabelText(/prompt/i)
    // Image model: flat cost, no duration control. The cost label is queried
    // by test id — the model cards show the same price text as a hint.
    expect(screen.queryByRole('group', { name: /duration/i })).not.toBeInTheDocument()
    expect(screen.getByTestId('cost-label')).toHaveTextContent('≈ 1 credit')
    // v3 stage-3: the cost numeral glows specimen-green — the price belongs
    // to the green create action it sits beside
    expect(screen.getByTestId('cost-label')).toHaveClass('text-glow-green')
    // Video model: duration pills drive the cost
    await userEvent.click(screen.getByRole('button', { name: /^video$/i }))
    const durationGroup = await screen.findByRole('group', { name: /duration/i })
    expect(within(durationGroup).getByRole('button', { name: '5s' })).toBeInTheDocument()
    expect(screen.getByTestId('cost-label')).toHaveTextContent('≈ 35 credits')
    await userEvent.click(within(durationGroup).getByRole('button', { name: '8s' }))
    expect(screen.getByTestId('cost-label')).toHaveTextContent('≈ 56 credits')
  })

  it('offers the image upload only for models with image input support', async () => {
    mockApiHappyPath()
    renderPanel()
    await screen.findByLabelText(/prompt/i)
    // flux-schnell does not support i2v
    expect(screen.queryByLabelText(/animate an image/i)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^video$/i }))
    expect(await screen.findByLabelText(/animate an image/i)).toBeInTheDocument()
  })

  it('rejects non-image uploads with a localized inline error', async () => {
    mockApiHappyPath()
    renderPanel()
    await screen.findByLabelText(/prompt/i)
    await userEvent.click(screen.getByRole('button', { name: /^video$/i }))
    const input = await screen.findByLabelText(/animate an image/i)
    const file = new File(['not an image'], 'notes.txt', { type: 'text/plain' })
    // applyAccept: false — bypass the native accept filter to hit OUR validator
    // (real users can force a wrong file via drag-and-drop)
    await userEvent.upload(input, file, { applyAccept: false })
    expect(await screen.findByRole('alert')).toHaveTextContent(/only image files/i)
  })

  it('disables submit until the prompt has at least 2 characters', async () => {
    mockApiHappyPath()
    renderPanel()
    const prompt = await screen.findByLabelText(/prompt/i)
    const submit = screen.getByRole('button', { name: /generate/i })
    expect(submit).toBeDisabled()
    await userEvent.type(prompt, 'a')
    expect(submit).toBeDisabled()
    await userEvent.type(prompt, 'b')
    expect(submit).toBeEnabled()
  })

  it('submits the exact CreateGenerationInput to POST /api/generations', async () => {
    mockApiHappyPath()
    renderPanel()
    const prompt = await screen.findByLabelText(/prompt/i)
    await userEvent.click(screen.getByRole('button', { name: /^video$/i }))
    await userEvent.type(prompt, 'ocean waves')
    await userEvent.click(screen.getByRole('button', { name: /generate/i }))
    await waitFor(() => {
      expect(apiMock).toHaveBeenCalledWith('/api/generations', expect.anything())
    })
    const call = apiMock.mock.calls.find(([path]) => path === '/api/generations')
    expect(call?.[1]?.method).toBe('POST')
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      modelId: 'pixverse-v6',
      prompt: 'ocean waves',
      aspectRatio: '1:1',
      duration: 5,
    })
  })

  it('surfaces a safety block with dedicated localized copy instead of the generic error', async () => {
    apiMock.mockImplementation((path) => {
      if (path === '/api/catalog') return Promise.resolve({ models })
      return Promise.reject(
        new ApiClientError('content_blocked', 'Blocked by the content safety filter', 422),
      )
    })
    renderPanel()
    const prompt = await screen.findByLabelText(/prompt/i)
    await userEvent.type(prompt, 'red fox in the snow')
    await userEvent.click(screen.getByRole('button', { name: /generate/i }))
    const banner = await screen.findByRole('alert')
    expect(banner).toHaveTextContent(/safety filter/i)
    expect(banner).toHaveTextContent(/refunded/i)
  })

  it('surfaces insufficient credits inline with a link to pricing', async () => {
    apiMock.mockImplementation((path) => {
      if (path === '/api/catalog') return Promise.resolve({ models })
      return Promise.reject(new ApiClientError('insufficient_credits', 'Not enough credits', 402))
    })
    renderPanel()
    const prompt = await screen.findByLabelText(/prompt/i)
    await userEvent.type(prompt, 'red fox in the snow')
    await userEvent.click(screen.getByRole('button', { name: /generate/i }))
    const banner = await screen.findByRole('alert')
    expect(banner).toHaveTextContent(/not enough credits/i)
    expect(within(banner).getByRole('link', { name: /pricing/i })).toHaveAttribute(
      'href',
      '/pricing',
    )
  })

  // QA finding 3: every envelope code gets OUR localized primary copy; the raw
  // server message may only appear as a quiet secondary diagnostic line.
  it('maps provider errors to localized copy with the raw detail as a secondary line', async () => {
    apiMock.mockImplementation((path) => {
      if (path === '/api/catalog') return Promise.resolve({ models })
      return Promise.reject(new ApiClientError('provider_error', 'Runware task xyz failed', 502))
    })
    renderPanel()
    const prompt = await screen.findByLabelText(/prompt/i)
    await userEvent.type(prompt, 'red fox in the snow')
    await userEvent.click(screen.getByRole('button', { name: /generate/i }))
    const banner = await screen.findByRole('alert')
    expect(banner).toHaveTextContent(/provider could not finish/i)
    // Raw text present, but only as the secondary mist-dim line
    expect(within(banner).getByText('Runware task xyz failed')).toHaveClass('text-mist-dim')
  })

  it('maps a conflict failure to its dedicated localized copy', async () => {
    apiMock.mockImplementation((path) => {
      if (path === '/api/catalog') return Promise.resolve({ models })
      return Promise.reject(new ApiClientError('conflict', 'Generation still processing', 409))
    })
    renderPanel()
    const prompt = await screen.findByLabelText(/prompt/i)
    await userEvent.type(prompt, 'red fox in the snow')
    await userEvent.click(screen.getByRole('button', { name: /generate/i }))
    const banner = await screen.findByRole('alert')
    expect(banner).toHaveTextContent(/wait for it to finish/i)
  })

  it('shows the generic localized message for non-API failures without leaking raw text', async () => {
    apiMock.mockImplementation((path) => {
      if (path === '/api/catalog') return Promise.resolve({ models })
      // A plain network failure — no envelope, no code
      return Promise.reject(new Error('Failed to fetch'))
    })
    renderPanel()
    const prompt = await screen.findByLabelText(/prompt/i)
    await userEvent.type(prompt, 'red fox in the snow')
    await userEvent.click(screen.getByRole('button', { name: /generate/i }))
    const banner = await screen.findByRole('alert')
    expect(banner).toHaveTextContent(/something went wrong/i)
    // Not server envelope text — a raw exception message is never user copy
    expect(within(banner).queryByText('Failed to fetch')).not.toBeInTheDocument()
  })
})
