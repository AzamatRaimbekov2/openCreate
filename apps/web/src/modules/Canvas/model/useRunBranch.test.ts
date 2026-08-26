// "Run branch" (ADR canvas-mode D5): the client topo-sorts what the target needs,
// prices it, asks once, then runs it sequentially. The rules that cost money if
// wrong, and are therefore pinned here:
//   * dependency order (a parent must finish before its child submits);
//   * a SATISFIED node ends the walk — neither it NOR anything behind it runs,
//     because nothing downstream would ever read that output;
//   * a plan that cannot run names its blocker instead of offering a button;
//   * video is priced at the SELECTED duration, and an unpriceable node makes the
//     whole total null (a null price is not a price — SpendConfirmModal's law);
//   * a mid-branch failure STOPS the run: downstream never starts.
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CanvasDetail, CanvasEdge, CanvasNode, Generation } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'
import type { CanvasModelOption } from './types'
import { useCanvasStore } from './canvasStore'
import {
  buildBranchPlan,
  collectBranch,
  estimateBranchCredits,
  useRunBranch,
} from './useRunBranch'

vi.mock('shared/libs/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared/libs/apiClient')>()
  return { ...actual, api: vi.fn() }
})
const apiMock = vi.mocked(api)

const imageNode = (id: string, generationIds: string[] = []): CanvasNode => ({
  id,
  kind: 'image',
  position: { x: 0, y: 0 },
  config: { prompt: 'a fox', modelId: 'flux-dev', aspectRatio: '1:1' },
  generationIds,
})

const videoNode = (id: string, duration?: number): CanvasNode => ({
  id,
  kind: 'video',
  position: { x: 0, y: 0 },
  config: {
    prompt: 'it walks away',
    modelId: 'pixverse-v6',
    aspectRatio: '16:9',
    ...(duration === undefined ? {} : { duration }),
  },
  generationIds: [],
})

const wire = (sourceNodeId: string, targetNodeId: string): CanvasEdge => ({
  id: `e-${sourceNodeId}-${targetNodeId}`,
  sourceNodeId,
  targetNodeId,
})

const MODELS: CanvasModelOption[] = [
  {
    id: 'flux-dev',
    name: 'Studio',
    providerLabel: 'FLUX dev',
    type: 'image',
    credits: 2,
    aspectRatios: ['1:1'],
  },
  {
    id: 'pixverse-v6',
    name: 'Motion',
    providerLabel: 'PixVerse v6',
    type: 'video',
    credits: 12,
    aspectRatios: ['16:9'],
    durationOptions: [5, 8],
    creditsByDuration: { '5': 12, '8': 19 },
  },
]

describe('collectBranch', () => {
  it('returns the target alone when nothing feeds it', () => {
    const node = imageNode('n1')
    expect(collectBranch('n1', [node], [])).toEqual(['n1'])
  })

  it('orders ancestors before the node that consumes them', () => {
    const a = imageNode('a')
    const b = imageNode('b')
    const c = videoNode('c')
    const nodes = [c, b, a] // deliberately reverse-declared: order comes from the GRAPH
    const edges = [wire('a', 'b'), wire('b', 'c')]
    expect(collectBranch('c', nodes, edges)).toEqual(['a', 'b', 'c'])
  })

  it('walks a diamond once, parents before the join', () => {
    // a → b → d and a → c → d: `a` must appear once, and before b and c
    const nodes = [imageNode('a'), imageNode('b'), imageNode('c'), videoNode('d')]
    const edges = [wire('a', 'b'), wire('a', 'c'), wire('b', 'd'), wire('c', 'd')]
    const order = collectBranch('d', nodes, edges)
    expect(order.filter((id) => id === 'a')).toHaveLength(1)
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'))
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('c'))
    expect(order.at(-1)).toBe('d')
  })

  it('skips a node whose LATEST generation succeeded — and everything behind it', () => {
    // a → b → c, and b is already done. Re-running `a` would charge for an image
    // nobody reads: b will not re-run, so it never consumes a fresh `a`.
    const a = imageNode('a')
    const b = imageNode('b', ['g-b'])
    const c = videoNode('c')
    const edges = [wire('a', 'b'), wire('b', 'c')]
    expect(collectBranch('c', [a, b, c], edges, { 'g-b': 'succeeded' })).toEqual(['c'])
  })

  it('re-runs a node whose latest attempt FAILED, even if an older one succeeded', () => {
    const a = imageNode('a', ['g-ok', 'g-bad'])
    const b = videoNode('b')
    const edges = [wire('a', 'b')]
    const statuses = { 'g-ok': 'succeeded', 'g-bad': 'failed' } as const
    expect(collectBranch('b', [a, b], edges, statuses)).toEqual(['a', 'b'])
  })

  it('leaves non-runnable kinds out of the plan (character / upload / note never run)', () => {
    const character: CanvasNode = {
      id: 'ch',
      kind: 'character',
      position: { x: 0, y: 0 },
      config: { entityId: 'ent1' },
      generationIds: [],
    }
    const upload: CanvasNode = {
      id: 'up',
      kind: 'upload',
      position: { x: 0, y: 0 },
      config: {},
      generationIds: [],
      uploadUrl: '/media/a.webp',
    }
    const target = imageNode('n1')
    const edges = [wire('ch', 'n1'), wire('up', 'n1')]
    expect(collectBranch('n1', [character, upload, target], edges)).toEqual(['n1'])
  })

  it('returns nothing when the target itself is already satisfied', () => {
    const node = imageNode('n1', ['g1'])
    expect(collectBranch('n1', [node], [], { g1: 'succeeded' })).toEqual([])
  })
})

describe('estimateBranchCredits', () => {
  it('prices an image at its flat cost and a video at the SELECTED duration', () => {
    const image = imageNode('i')
    const video = videoNode('v', 8)
    const estimate = estimateBranchCredits(['i', 'v'], [image, video], MODELS)
    expect(estimate.items.map((item) => item.credits)).toEqual([2, 19])
    expect(estimate.total).toBe(21)
  })

  it('falls back to the first duration option when the node has not chosen one', () => {
    const video = videoNode('v')
    const estimate = estimateBranchCredits(['v'], [video], MODELS)
    expect(estimate.items[0]?.credits).toBe(12)
  })

  it('carries the model name per row so the dialog can name what it charges for', () => {
    const estimate = estimateBranchCredits(['i'], [imageNode('i')], MODELS)
    expect(estimate.items[0]).toMatchObject({ nodeId: 'i', kind: 'image', modelName: 'Studio' })
  })

  it('makes the total NULL when any row is unpriceable (a null price is not a price)', () => {
    // A document naming a model the catalog no longer has: the dialog must not
    // invent a number, so the confirm is disabled rather than guessing.
    const stale: CanvasNode = { ...imageNode('i'), config: { prompt: 'x', modelId: 'gone' } }
    const estimate = estimateBranchCredits(['i'], [stale], MODELS)
    expect(estimate.items[0]?.credits).toBeNull()
    expect(estimate.total).toBeNull()
  })
})

describe('buildBranchPlan', () => {
  const client = () => new QueryClient()
  const seed = (queryClient: QueryClient, id: string, status: Generation['status']) =>
    queryClient.setQueryData(['generation', id], { id, status } as Generation)

  it('plans a runnable chain with its itemized cost', () => {
    const a = imageNode('a')
    const b = videoNode('b', 5)
    const plan = buildBranchPlan('b', [a, b], [wire('a', 'b')], MODELS, client())
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.nodeIds).toEqual(['a', 'b'])
    expect(plan.total).toBe(14)
  })

  it('accepts a child whose parent has no output YET, because the parent runs first', () => {
    // This is the whole point of a branch: `b` is not runnable on its own (its
    // media parent has never produced anything), but the plan runs `a` before it.
    const a = imageNode('a')
    const b = videoNode('b', 5)
    const plan = buildBranchPlan('b', [a, b], [wire('a', 'b')], MODELS, client())
    expect(plan.ok).toBe(true)
  })

  it('refuses a plan whose node has no prompt, naming the blocker', () => {
    const a: CanvasNode = { ...imageNode('a'), config: { modelId: 'flux-dev' } }
    const b = videoNode('b', 5)
    const plan = buildBranchPlan('b', [a, b], [wire('a', 'b')], MODELS, client())
    expect(plan).toEqual({ ok: false, nodeId: 'a', reason: 'config' })
  })

  it('refuses a plan whose node has a character wire with nobody cast', () => {
    const character: CanvasNode = {
      id: 'ch',
      kind: 'character',
      position: { x: 0, y: 0 },
      config: {},
      generationIds: [],
    }
    const target = imageNode('n1')
    const plan = buildBranchPlan(
      'n1',
      [character, target],
      [wire('ch', 'n1')],
      MODELS,
      client(),
    )
    expect(plan).toEqual({ ok: false, nodeId: 'n1', reason: 'character' })
  })

  it('refuses a plan whose media parent can never produce an output in this run', () => {
    // An upload parent is not a generation and is not runnable, so nothing in the
    // plan will ever give this node its input (phase 4 makes uploads citable).
    const upload: CanvasNode = {
      id: 'up',
      kind: 'upload',
      position: { x: 0, y: 0 },
      config: {},
      generationIds: [],
      uploadUrl: '/media/a.webp',
    }
    const target = imageNode('n1')
    const plan = buildBranchPlan('n1', [upload, target], [wire('up', 'n1')], MODELS, client())
    expect(plan).toEqual({ ok: false, nodeId: 'n1', reason: 'parent' })
  })

  it('refuses an empty plan: everything the target needs already exists', () => {
    const node = imageNode('n1', ['g1'])
    const queryClient = client()
    seed(queryClient, 'g1', 'succeeded')
    const plan = buildBranchPlan('n1', [node], [], MODELS, queryClient)
    expect(plan).toEqual({ ok: false, nodeId: 'n1', reason: 'nothingToRun' })
  })

  // ADR canvas-prompt-node D3: the plan asks the SAME question the run path
  // asks. A node whose text comes from a wired template is plannable with an
  // empty field of its own — and a plan that said 'config' there would have put
  // a blocker on a chain the per-node Generate button happily runs.
  it('plans a node whose prompt comes from a wired template', () => {
    const template: CanvasNode = {
      id: 't1',
      kind: 'prompt',
      position: { x: 0, y: 0 },
      config: { prompt: 'cinematic 35mm, neon' },
      generationIds: [],
    }
    const node: CanvasNode = { ...imageNode('n1'), config: { modelId: 'flux-dev' } }
    const plan = buildBranchPlan('n1', [template, node], [wire('t1', 'n1')], MODELS, client())
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    // The template itself is furniture: it never runs and is never priced.
    expect(plan.nodeIds).toEqual(['n1'])
    expect(plan.total).toBe(2)
  })

  it('still blocks on config when the template is wired but empty', () => {
    const template: CanvasNode = {
      id: 't1',
      kind: 'prompt',
      position: { x: 0, y: 0 },
      config: { prompt: '' },
      generationIds: [],
    }
    const node: CanvasNode = { ...imageNode('n1'), config: { modelId: 'flux-dev' } }
    const plan = buildBranchPlan('n1', [template, node], [wire('t1', 'n1')], MODELS, client())
    expect(plan).toEqual({ ok: false, nodeId: 'n1', reason: 'config' })
  })

  it('reads live statuses out of the shared generation cache', () => {
    // The skip rule depends on the LIVE status of the last run, which only the
    // shared ['generation', id] cache knows.
    const a = imageNode('a', ['g-a'])
    const b = videoNode('b', 5)
    const queryClient = client()
    seed(queryClient, 'g-a', 'succeeded')
    const plan = buildBranchPlan('b', [a, b], [wire('a', 'b')], MODELS, queryClient)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.nodeIds).toEqual(['b'])
  })
})

// ── The sequential runner ────────────────────────────────────────────────────
// Every terminal status arrives on the FIRST poll here, so the loop never sleeps
// and these tests need no fake timers (the 4 s wait only happens while a run is
// still `processing`).
const DOC: CanvasDetail = {
  id: 'c1',
  title: 'T',
  viewport: { x: 0, y: 0, zoom: 1 },
  nodes: [imageNode('a'), videoNode('b', 5)],
  edges: [wire('a', 'b')],
  createdAt: '2026-07-30T00:00:00.000Z',
  updatedAt: '2026-07-30T00:00:00.000Z',
}

// POST /api/generations → a fresh processing row; GET → whatever the test wants
// that node's run to end as.
function mockRuns(outcome: (submitIndex: number) => Generation['status']) {
  let submits = 0
  const statusById = new Map<string, Generation['status']>()
  apiMock.mockImplementation((path: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      submits += 1
      const id = `g${submits}`
      statusById.set(id, outcome(submits))
      return Promise.resolve({ id, status: 'processing', mediaUrls: [] } as unknown as never)
    }
    const id = path.split('/').pop() ?? ''
    return Promise.resolve({
      id,
      status: statusById.get(id) ?? 'processing',
      mediaUrls: [],
      errorCode: statusById.get(id) === 'failed' ? 'provider_error' : null,
    } as unknown as never)
  })
}

function renderRunner() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return renderHook(() => useRunBranch(), {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children),
  })
}

describe('useRunBranch runner', () => {
  beforeEach(() => {
    apiMock.mockReset()
    useCanvasStore.getState().reset()
    useCanvasStore.getState().init(DOC)
  })

  it('submits the plan in dependency order and records each run on its node', async () => {
    mockRuns(() => 'succeeded')
    const { result } = renderRunner()
    const plan = result.current.buildPlan('b')
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    await act(async () => {
      await result.current.run(plan)
    })
    const posts = apiMock.mock.calls.filter(([, init]) => (init as RequestInit)?.method === 'POST')
    expect(posts).toHaveLength(2)
    const nodes = useCanvasStore.getState().nodes
    expect(nodes.find((n) => n.id === 'a')?.generationIds).toEqual(['g1'])
    expect(nodes.find((n) => n.id === 'b')?.generationIds).toEqual(['g2'])
    expect(result.current.state.status).toBe('done')
    expect(result.current.state.activeNodeId).toBeNull()
  })

  it('cites the parent run it just made as the child input (the chain closes itself)', async () => {
    mockRuns(() => 'succeeded')
    const { result } = renderRunner()
    const plan = result.current.buildPlan('b')
    if (!plan.ok) return
    await act(async () => {
      await result.current.run(plan)
    })
    const posts = apiMock.mock.calls.filter(([, init]) => (init as RequestInit)?.method === 'POST')
    const childBody = JSON.parse(String((posts[1]?.[1] as RequestInit).body)) as {
      inputGenerationId?: string
    }
    expect(childBody.inputGenerationId).toBe('g1')
  })

  it('STOPS at a mid-branch failure: downstream never submits', async () => {
    mockRuns((index) => (index === 1 ? 'failed' : 'succeeded'))
    const { result } = renderRunner()
    const plan = result.current.buildPlan('b')
    if (!plan.ok) return
    await act(async () => {
      await result.current.run(plan)
    })
    const posts = apiMock.mock.calls.filter(([, init]) => (init as RequestInit)?.method === 'POST')
    expect(posts).toHaveLength(1)
    expect(result.current.state.status).toBe('failed')
    expect(result.current.state.failedNodeId).toBe('a')
    expect(result.current.state.errorCode).toBe('provider_error')
    expect(useCanvasStore.getState().nodes.find((n) => n.id === 'b')?.generationIds).toEqual([])
  })

  it('cancel() stops the queue before the next node is charged', async () => {
    mockRuns(() => 'succeeded')
    const { result } = renderRunner()
    const plan = result.current.buildPlan('b')
    if (!plan.ok) return
    // Cancel the moment the first node's poll answers, i.e. before the loop can
    // move on to `b`. An already-submitted generation still finishes server-side.
    apiMock.mockImplementation((path: string, init?: RequestInit) => {
      if (init?.method === 'POST')
        return Promise.resolve({ id: 'g1', status: 'processing', mediaUrls: [] } as unknown as never)
      result.current.cancel()
      return Promise.resolve({
        id: path.split('/').pop(),
        status: 'succeeded',
        mediaUrls: ['/media/g1.webp'],
      } as unknown as never)
    })
    await act(async () => {
      await result.current.run(plan)
    })
    const posts = apiMock.mock.calls.filter(([, init]) => (init as RequestInit)?.method === 'POST')
    expect(posts).toHaveLength(1)
    expect(result.current.state.status).toBe('idle')
  })

  it('stops when the board changes under it (the route reset nulls the canvas)', async () => {
    mockRuns(() => 'succeeded')
    const { result } = renderRunner()
    const plan = result.current.buildPlan('b')
    if (!plan.ok) return
    apiMock.mockImplementation((path: string, init?: RequestInit) => {
      if (init?.method === 'POST')
        return Promise.resolve({ id: 'g1', status: 'processing', mediaUrls: [] } as unknown as never)
      // Leaving the canvas mid-run must not keep spending on a board nobody sees.
      useCanvasStore.getState().reset()
      return Promise.resolve({
        id: path.split('/').pop(),
        status: 'succeeded',
        mediaUrls: ['/media/g1.webp'],
      } as unknown as never)
    })
    await act(async () => {
      await result.current.run(plan)
    })
    const posts = apiMock.mock.calls.filter(([, init]) => (init as RequestInit)?.method === 'POST')
    expect(posts).toHaveLength(1)
    // ...and it must also RELEASE the board. Asserting only that spending stopped
    // let a real bug through: this exit `return`ed without a terminal status, and
    // the branch store is a module singleton the route never resets — so
    // `useIsBranchRunning()` stayed true and "Run branch" was disabled on every
    // node of every canvas until the tab was reloaded.
    expect(result.current.state.status).not.toBe('running')
    expect(result.current.state.activeNodeId).toBeNull()
  })

  it('a poll that outlives its budget ENDS the run instead of pinning it open', async () => {
    // The 20-minute ceiling exists so one stuck generation cannot hold the queue
    // for the rest of the session. Reaching it used to `return` with the status
    // still 'running' — same permanent lock as the board-change exit above, but
    // reached without the user doing anything at all.
    let now = 0
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now)
    try {
      const { result } = renderRunner()
      apiMock.mockImplementation((_path: string, init?: RequestInit) => {
        if (init?.method !== 'POST') {
          // The run never settles; step past the ceiling on the first poll.
          now += 21 * 60 * 1000
        }
        return Promise.resolve({
          id: 'g1',
          status: 'processing',
          mediaUrls: [],
        } as unknown as never)
      })
      const plan = result.current.buildPlan('a')
      expect(plan.ok).toBe(true)
      if (!plan.ok) return
      await act(async () => {
        await result.current.run(plan)
      })
      expect(result.current.state.status).toBe('failed')
      expect(result.current.state.failedNodeId).toBe('a')
      expect(result.current.state.errorCode).toBe('timeout')
      expect(result.current.state.activeNodeId).toBeNull()
    } finally {
      nowSpy.mockRestore()
    }
  })
})
