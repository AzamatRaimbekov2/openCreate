// The batch surface, end to end — and above all the CONFIRM, which ADR
// shorts-studio §4 calls "the load-bearing rule of the feature and the condition
// the template-catalog ADR set" when it rejected a "Generate all" button:
//
//   > Rejected: a "Generate all" button. It is the same trap with a better name.
//   > It can come back later as an explicit, itemised confirmation step.
//
// So this spec tests the dialog hardest. Four properties, each of which is a
// money bug if it breaks:
//   1. the total is stated as rows × beats × per-clip, not as one opaque number;
//   2. an unknown price DISABLES the confirm (no catalog, no number, no spend);
//   3. a balance short of the total disables it too, and says by how much;
//   4. nothing is charged and nothing is created until the confirm is pressed.
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
import type { CatalogModel } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'
import { resetBatchRun } from '../model/useBatchRun'
import { SHORTS_TEMPLATE, TIER_MODEL } from '../model/testFixtures'
import { ShortsStudio } from './ShortsStudio'
import 'shared/config/i18n'

vi.mock('shared/libs/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared/libs/apiClient')>()
  return { ...actual, api: vi.fn() }
})
const apiMock = vi.mocked(api)

// The server this studio talks to: a one-template catalogue, a balance, a batch
// endpoint that creates drafts for free, and the per-beat generation path.
function serveApi({ balance = 10_000 }: { balance?: number } = {}) {
  const calls = { batches: 0, submits: 0 }
  apiMock.mockImplementation((path: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (path === '/api/templates') {
      return Promise.resolve({ items: [SHORTS_TEMPLATE] } as unknown as never)
    }
    if (path === '/api/me') return Promise.resolve({ creditsBalance: balance } as unknown as never)
    if (path === '/api/films/from-template/batch') {
      calls.batches += 1
      const body = JSON.parse(String(init?.body ?? '{}')) as { rows: unknown[] }
      return Promise.resolve({
        batchId: 'batch-1',
        films: body.rows.map((_, index) => ({
          film: {
            id: `f${index}`,
            title: `Short ${index + 1}`,
            aspectRatio: '9:16',
            defaultStyleId: null,
            templateId: SHORTS_TEMPLATE.id,
            batchId: 'batch-1',
            coverUrl: null,
            createdAt: '2026-08-20T10:00:00.000Z',
            updatedAt: '2026-08-20T10:00:00.000Z',
          },
          shots: SHORTS_TEMPLATE.beats.map((beat, beatIndex) => ({
            id: `f${index}-s${beatIndex}`,
            filmId: `f${index}`,
            orderIndex: beatIndex,
            generationId: null,
            prompt: beat.generated ? 'authored beat prompt' : '',
            promptPreset: null,
            entityRefs: [],
            referenceImages: [],
            modelId: beat.generated ? TIER_MODEL.id : null,
            aspectRatio: null,
            durationMs: beat.durationSeconds * 1000,
            trimStartMs: 0,
            transition: 'none',
            transitionMs: 0,
            title: null,
            voiceover: null,
            audio: false,
            createdAt: '2026-08-20T10:00:00.000Z',
          })),
          audio: [],
          latestRender: null,
        })),
      } as unknown as never)
    }
    if (method === 'POST' && path === '/api/generations') {
      calls.submits += 1
      return Promise.resolve({
        id: `g${calls.submits}`,
        status: 'processing',
        mediaUrls: [],
      } as unknown as never)
    }
    if (method === 'PATCH') return Promise.resolve({ id: 'patched' } as unknown as never)
    return Promise.resolve({
      id: path.split('/').pop(),
      status: 'succeeded',
      mediaUrls: [],
      errorCode: null,
    } as unknown as never)
  })
  return calls
}

function renderStudio(models: CatalogModel[] = [TIER_MODEL]) {
  const onBatchCreated = vi.fn()
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => (
      <ShortsStudio models={models} batchId={null} onBatchCreated={onBatchCreated} />
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
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { onBatchCreated }
}

// Pick the one shorts format, then add rows until the table holds `rows` of them.
async function fillTable(user: ReturnType<typeof userEvent.setup>, rows: number) {
  await user.click(await screen.findByRole('button', { name: /Street hook/ }))
  for (let index = 1; index < rows; index += 1) {
    await user.click(await screen.findByRole('button', { name: 'Add a short' }))
  }
}

const openConfirm = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole('button', { name: /Run the batch/ }))
  return screen.findByRole('alertdialog')
}

beforeEach(() => {
  apiMock.mockReset()
  resetBatchRun()
})

describe('ShortsStudio', () => {
  it('shows only the shorts shelf, and its empty state when the shelf is bare', async () => {
    apiMock.mockImplementation((path: string) =>
      path === '/api/templates'
        ? (Promise.resolve({ items: [] }) as unknown as never)
        : (Promise.resolve({ creditsBalance: 0 }) as unknown as never),
    )
    renderStudio()
    expect(await screen.findByText('No shorts templates yet')).toBeInTheDocument()
  })

  it('shows an error with a retry when the catalogue cannot be read', async () => {
    apiMock.mockRejectedValue(new Error('offline'))
    renderStudio()
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('prices the batch live as rows are added', async () => {
    const user = userEvent.setup()
    serveApi()
    renderStudio()
    await fillTable(user, 1)
    // One short: 3 generated beats × 30 cr.
    expect(await screen.findByRole('button', { name: 'Run the batch · 90 cr' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add a short' }))
    expect(await screen.findByRole('button', { name: 'Run the batch · 180 cr' })).toBeInTheDocument()
  })

  it('states rows × beats × per-clip and the total in the confirm', async () => {
    const user = userEvent.setup()
    serveApi()
    renderStudio()
    await fillTable(user, 2)
    const dialog = await openConfirm(user)
    // The arithmetic, spelled out — not one opaque number.
    expect(within(dialog).getByText('2 shorts × 3 beats × 30 cr')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Run and charge 180 cr' })).toBeEnabled()
  })

  it('states the balance and disables the confirm when it falls short', async () => {
    const user = userEvent.setup()
    serveApi({ balance: 100 })
    renderStudio()
    await fillTable(user, 2)
    const dialog = await openConfirm(user)
    expect(within(dialog).getByText('Your balance')).toBeInTheDocument()
    expect(within(dialog).getByText('Short by')).toBeInTheDocument()
    // 180 needed, 100 held → 80 short, and the confirm is dead.
    expect(within(dialog).getByText('80 cr')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /Run and charge/ })).toBeDisabled()
  })

  it('refuses to offer a run at all when the price is unknown', async () => {
    // An empty catalog is the normal first render. No number, no confirm — the
    // dialog is the last place to invent one.
    const user = userEvent.setup()
    serveApi()
    renderStudio([])
    await fillTable(user, 1)
    expect(await screen.findByText('Price unavailable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run the batch' })).toBeDisabled()
  })

  it('charges NOTHING and creates nothing until the confirm is pressed', async () => {
    const user = userEvent.setup()
    const calls = serveApi()
    renderStudio()
    await fillTable(user, 2)
    const dialog = await openConfirm(user)
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(calls.batches).toBe(0)
    expect(calls.submits).toBe(0)
  })

  it('creates the drafts and then runs every beat once confirmed', async () => {
    const user = userEvent.setup()
    const calls = serveApi()
    const { onBatchCreated } = renderStudio()
    await fillTable(user, 2)
    const dialog = await openConfirm(user)
    await user.click(within(dialog).getByRole('button', { name: 'Run and charge 180 cr' }))
    // One creation call for the whole batch, then one submit per payable beat.
    expect(await screen.findByRole('article', { name: 'Short 1' })).toBeInTheDocument()
    expect(calls.batches).toBe(1)
    expect(calls.submits).toBe(6)
    // The batch id goes to the route, which puts it in the URL — that is what
    // makes the board survive a reload (ADR §2).
    expect(onBatchCreated).toHaveBeenCalledWith('batch-1')
  })

  it('will not offer a run while any row is incomplete', async () => {
    const user = userEvent.setup()
    serveApi()
    renderStudio()
    await fillTable(user, 1)
    await user.clear(await screen.findByLabelText('Hook line'))
    expect(await screen.findByText('Fill every field in every row before running.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Run the batch/ })).toBeDisabled()
  })
})
