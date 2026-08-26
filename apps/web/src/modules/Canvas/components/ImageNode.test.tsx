// The image node's 4 preview states + the Generate gate (disabled without a
// runnable input). Hooks are mocked; React Flow needs its provider for Handle.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReactFlowProvider } from '@xyflow/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Generation } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'
import type { CanvasModelOption } from '../model/types'
import { useCanvasStore } from '../model/canvasStore'
import { useNodeGeneration, useRunNode } from '../model/useNodeGeneration'
import { useIsBranchBusy, useIsBranchRunning, useRunBranch } from '../model/useRunBranch'
import { ImageNode } from './ImageNode'
// i18n init — the enhance affordance renders its own localized aria-label
import 'shared/config/i18n'

vi.mock('../model/useNodeGeneration', async (importOriginal) => {
  const original = await importOriginal<typeof import('../model/useNodeGeneration')>()
  return { ...original, useRunNode: vi.fn(), useNodeGeneration: vi.fn() }
})
// The branch runner is exercised in useRunBranch.test.ts; here only the node's
// SIDE of it matters (a pill that plans + confirms, and a Generate that steps
// aside while a queue owns this node), so its hooks are stubbed.
vi.mock('../model/useRunBranch', async (importOriginal) => {
  const original = await importOriginal<typeof import('../model/useRunBranch')>()
  return {
    ...original,
    useRunBranch: vi.fn(),
    useIsBranchBusy: vi.fn(() => false),
    useIsBranchRunning: vi.fn(() => false),
    useBranchNodeError: vi.fn(() => null),
  }
})
// Only api() — the run/poll hooks above are mocked separately, so the only real
// request this file can make is the enhance POST the sparkle fires.
vi.mock('shared/libs/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared/libs/apiClient')>()
  return { ...actual, api: vi.fn() }
})
const mockRun = vi.mocked(useRunNode)
const mockPoll = vi.mocked(useNodeGeneration)
const apiMock = vi.mocked(api)
const mockBranch = vi.mocked(useRunBranch)
const mockBusy = vi.mocked(useIsBranchBusy)

const BRANCH_PLAN = {
  ok: true as const,
  nodeIds: ['n1'],
  items: [{ nodeId: 'n1', kind: 'image' as const, modelName: 'Studio', credits: 2 }],
  total: 2,
}

const DOC = {
  id: 'c1',
  title: 'T',
  viewport: { x: 0, y: 0, zoom: 1 },
  nodes: [
    {
      id: 'n1',
      kind: 'image' as const,
      position: { x: 0, y: 0 },
      config: { prompt: 'a fox', modelId: 'flux-dev', aspectRatio: '1:1' as const },
      generationIds: [] as string[],
    },
  ],
  edges: [],
  createdAt: '2026-07-30T00:00:00.000Z',
  updatedAt: '2026-07-30T00:00:00.000Z',
}

const MODELS: CanvasModelOption[] = [
  {
    id: 'flux-dev',
    name: 'Studio',
    providerLabel: 'FLUX dev',
    type: 'image',
    credits: 2,
    aspectRatios: ['16:9', '1:1', '9:16'],
  },
  // The reference-capable counterpart: only this one may hold a character
  {
    id: 'flux-kontext-pro',
    name: 'Kontext',
    providerLabel: 'FLUX.1 Kontext',
    type: 'image',
    credits: 8,
    aspectRatios: ['16:9', '1:1', '9:16'],
    referenceMode: 'both',
  },
]

// A character node wired into n1 — the graph shape phase 3 introduces
const CHARACTER_DOC = {
  ...DOC,
  nodes: [
    ...DOC.nodes,
    {
      id: 'ch1',
      kind: 'character' as const,
      position: { x: 0, y: 0 },
      config: { entityId: 'ent1' },
      generationIds: [] as string[],
    },
  ],
  edges: [{ id: 'e-ch', sourceNodeId: 'ch1', targetNodeId: 'n1' }],
}

function renderNode(client: QueryClient = new QueryClient()) {
  return render(
    <QueryClientProvider client={client}>
      <ReactFlowProvider>
        <ImageNode id="n1" data={{ models: MODELS }} />
      </ReactFlowProvider>
    </QueryClientProvider>,
  )
}

const gen = (
  status: Generation['status'],
  overrides: Partial<Generation> = {},
): Generation =>
  ({
    id: 'g1',
    type: 'image',
    mode: 'text',
    status,
    prompt: 'a fox',
    modelId: 'flux-dev',
    params: { aspectRatio: '1:1' },
    costCredits: 2,
    progress: null,
    mediaUrls: status === 'succeeded' ? ['/media/g1.webp'] : [],
    errorMessage: status === 'failed' ? 'provider down' : null,
    errorCode: status === 'failed' ? 'provider_error' : null,
    createdAt: '2026-07-30T00:00:00.000Z',
    completedAt: null,
    ...overrides,
  }) as Generation

beforeEach(() => {
  vi.clearAllMocks()
  useCanvasStore.getState().reset()
  useCanvasStore.getState().init(DOC)
  mockRun.mockReturnValue({ mutate: vi.fn(), isPending: false } as never)
  mockPoll.mockReturnValue({ data: undefined } as never)
  // Both branch flags are re-armed per test: `vi.clearAllMocks()` clears CALLS
  // but keeps implementations, so a `mockReturnValue(true)` in one test would
  // otherwise leak into every test after it.
  mockBusy.mockReturnValue(false)
  vi.mocked(useIsBranchRunning).mockReturnValue(false)
  mockBranch.mockReturnValue({
    buildPlan: vi.fn(() => BRANCH_PLAN),
    run: vi.fn(),
    cancel: vi.fn(),
    state: { status: 'idle', activeNodeId: null, nodeIds: [], failedNodeId: null, errorCode: null },
  } as never)
})

describe('ImageNode', () => {
  it('idle: shows the prompt, the cost chip and an enabled Generate', () => {
    renderNode()
    expect(screen.getByDisplayValue('a fox')).toBeInTheDocument()
    expect(screen.getByText('2 cr')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /generate/i })).toBeEnabled()
  })

  it('processing: skeleton + amber word', () => {
    useCanvasStore.getState().appendGeneration('n1', 'g1')
    mockPoll.mockReturnValue({ data: gen('processing') } as never)
    renderNode()
    expect(screen.getByText('processing')).toBeInTheDocument()
  })

  it('processing: shows the progress percent next to the amber status (I5)', () => {
    useCanvasStore.getState().appendGeneration('n1', 'g1')
    mockPoll.mockReturnValue({ data: gen('processing', { progress: 42 }) } as never)
    renderNode()
    expect(screen.getByText(/42%/)).toBeInTheDocument()
  })

  it('succeeded: renders the media preview', () => {
    useCanvasStore.getState().appendGeneration('n1', 'g1')
    mockPoll.mockReturnValue({ data: gen('succeeded') } as never)
    renderNode()
    expect(screen.getByRole('img')).toHaveAttribute('src', '/media/g1.webp')
  })

  it('failed: shows the error and a retry that resubmits', () => {
    useCanvasStore.getState().appendGeneration('n1', 'g1')
    mockPoll.mockReturnValue({ data: gen('failed') } as never)
    const mutate = vi.fn()
    mockRun.mockReturnValue({ mutate, isPending: false } as never)
    renderNode()
    expect(screen.getByRole('alert')).toBeInTheDocument()
    screen.getByRole('button', { name: /retry/i }).click()
    expect(mutate).toHaveBeenCalledTimes(1)
  })

  it('failed: leads with OUR localized copy, not the raw provider errorMessage (C3)', () => {
    useCanvasStore.getState().appendGeneration('n1', 'g1')
    mockPoll.mockReturnValue({
      data: gen('failed', { errorCode: 'provider_error', errorMessage: 'raw upstream stack trace' }),
    } as never)
    renderNode()
    // Primary line is OUR copy for provider_error, not the raw string
    expect(
      screen.getByText('The model provider could not finish this generation.'),
    ).toBeInTheDocument()
    // The raw string may still appear as a SECONDARY line (not content_blocked)
    expect(screen.getByText('raw upstream stack trace')).toBeInTheDocument()
  })

  it('failed: content_blocked never shows the raw provider string (C3)', () => {
    useCanvasStore.getState().appendGeneration('n1', 'g1')
    mockPoll.mockReturnValue({
      data: gen('failed', {
        errorCode: 'content_blocked',
        errorMessage: 'nsfw moderation internal string',
      }),
    } as never)
    renderNode()
    expect(
      screen.getByText('Blocked by the safety filter — try a different prompt.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('nsfw moderation internal string')).not.toBeInTheDocument()
  })

  it('failed: renders a "credits refunded" chip (C4)', () => {
    useCanvasStore.getState().appendGeneration('n1', 'g1')
    mockPoll.mockReturnValue({ data: gen('failed') } as never)
    renderNode()
    expect(screen.getByText(/refund/i)).toBeInTheDocument()
  })

  it('disables Generate when the prompt is empty', () => {
    useCanvasStore.getState().updateNodeConfig('n1', { prompt: '' })
    renderNode()
    expect(screen.getByRole('button', { name: /generate/i })).toBeDisabled()
  })

  it('disables Generate while a wired media parent has no succeeded run yet (C2)', () => {
    // n1 gains a media parent 'p' whose latest generation is still processing.
    useCanvasStore.getState().init({
      ...DOC,
      nodes: [...DOC.nodes, { ...DOC.nodes[0]!, id: 'p', generationIds: ['g-parent'] }],
      edges: [{ id: 'e1', sourceNodeId: 'p', targetNodeId: 'n1' }],
    })
    const client = new QueryClient()
    client.setQueryData(['generation', 'g-parent'], gen('processing'))
    renderNode(client)
    expect(screen.getByRole('button', { name: /generate/i })).toBeDisabled()
  })

  it('offers a Run-branch pill that opens the confirm dialog with the priced plan', async () => {
    renderNode()
    await userEvent.click(screen.getByRole('button', { name: /run branch/i }))
    // The dialog restates the total ON the pill the click will land on. Matched
    // by the full confirm label, not just the price: the model Select's trigger
    // also carries "2 cr" in its accessible name (its `meta` slot).
    expect(await screen.findByRole('button', { name: /run · 2 cr/i })).toBeInTheDocument()
  })

  it('confirming the dialog hands the SAME plan to the runner', async () => {
    const run = vi.fn()
    const buildPlan = vi.fn(() => BRANCH_PLAN)
    mockBranch.mockReturnValue({
      buildPlan,
      run,
      cancel: vi.fn(),
      state: {
        status: 'idle',
        activeNodeId: null,
        nodeIds: [],
        failedNodeId: null,
        errorCode: null,
      },
    } as never)
    renderNode()
    await userEvent.click(screen.getByRole('button', { name: /run branch/i }))
    await userEvent.click(screen.getByRole('button', { name: /run · 2 cr/i }))
    expect(run).toHaveBeenCalledWith(BRANCH_PLAN)
    // Planned against THIS node, with the catalog the node already holds
    expect(buildPlan).toHaveBeenCalledWith('n1', MODELS)
  })

  it('steps aside while a branch owns this node: no second charge from Generate', () => {
    // Both flags, because that is the real state: a node can only be "owned by a
    // branch" while a branch is running.
    mockBusy.mockReturnValue(true)
    vi.mocked(useIsBranchRunning).mockReturnValue(true)
    renderNode()
    expect(screen.getByRole('button', { name: /generate/i })).toBeDisabled()
    // No SECOND queue can be started — but the pill is no longer merely dead:
    // it is now the exit from the running one, so the guarantee is "Run branch
    // is not offered", not "Run branch is disabled".
    expect(screen.queryByRole('button', { name: /run branch/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /stop/i })).toBeEnabled()
  })

  it('enhances the prompt in place from the sparkle, and the node keeps the result', async () => {
    // Owner requirement: every node prompt field carries the enhance affordance.
    // The enhanced text must land in the DOCUMENT (config.prompt), not in local
    // component state — otherwise autosave would never persist it and the run
    // would submit the old draft.
    apiMock.mockResolvedValue({ prompt: 'a red fox at cinematic dusk, 35mm' })
    renderNode()
    await userEvent.click(screen.getByRole('button', { name: /enhance prompt/i }))
    expect(await screen.findByDisplayValue('a red fox at cinematic dusk, 35mm')).toBeInTheDocument()
    expect(useCanvasStore.getState().nodes[0]?.config.prompt).toBe(
      'a red fox at cinematic dusk, 35mm',
    )
    expect(apiMock).toHaveBeenCalledWith(
      '/api/prompt/enhance',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('a wired character narrows the picker to reference-capable models', async () => {
    // The server refuses a character on a model with no referenceMode with a
    // clean 400 (nothing charged) — but offering a choice that is guaranteed to
    // be refused is a promise the product does not keep (ModelSelect precedent).
    useCanvasStore.getState().init(CHARACTER_DOC)
    renderNode()
    await userEvent.click(screen.getByRole('button', { name: /model/i }))
    const options = screen.getAllByRole('option').map((option) => option.textContent ?? '')
    expect(options.some((label) => label.includes('Kontext'))).toBe(true)
    expect(options.some((label) => label.includes('Studio'))).toBe(false)
  })

  it('blocks the run with a hint when the chosen model cannot hold a wired character', () => {
    // n1 still points at flux-dev (chosen before the wire existed): say why it
    // cannot run instead of letting the click buy a guaranteed 400.
    useCanvasStore.getState().init(CHARACTER_DOC)
    renderNode()
    expect(screen.getByText(/cannot hold a character/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /generate/i })).toBeDisabled()
  })

  it('enables Generate once the wired media parent has a succeeded run (C2)', () => {
    useCanvasStore.getState().init({
      ...DOC,
      nodes: [...DOC.nodes, { ...DOC.nodes[0]!, id: 'p', generationIds: ['g-parent'] }],
      edges: [{ id: 'e1', sourceNodeId: 'p', targetNodeId: 'n1' }],
    })
    const client = new QueryClient()
    client.setQueryData(['generation', 'g-parent'], gen('succeeded'))
    renderNode(client)
    expect(screen.getByRole('button', { name: /generate/i })).toBeEnabled()
  })

  it('SAYS WHY Generate is dead when the only wired input is an upload', () => {
    // An upload is legal to wire (edgeRules allows it) and cannot be cited yet,
    // so Generate disables. Disabling SILENTLY is the same defect the refused-wire
    // toast was built to fix: a rule working as designed, indistinguishable from a
    // broken feature. The card must name the reason and the way out.
    useCanvasStore.getState().init({
      ...DOC,
      nodes: [
        ...DOC.nodes,
        {
          id: 'up',
          kind: 'upload' as const,
          position: { x: 0, y: 0 },
          config: {},
          generationIds: [] as string[],
          uploadUrl: '/media/a.webp',
        },
      ],
      edges: [{ id: 'e-up', sourceNodeId: 'up', targetNodeId: 'n1' }],
    })
    renderNode()
    expect(screen.getByRole('button', { name: /generate/i })).toBeDisabled()
    expect(screen.getByText(/uploaded image/i)).toBeInTheDocument()
  })

  it('offers a way to STOP a running branch', async () => {
    // `cancel()` existed, was exported and was unit-tested — and no component ever
    // called it. Once a queue started there was no exit: a long branch ran to the
    // end and spent every credit in its plan.
    const cancel = vi.fn()
    mockBranch.mockReturnValue({
      buildPlan: vi.fn(() => BRANCH_PLAN),
      run: vi.fn(),
      cancel,
      state: {
        status: 'running',
        activeNodeId: 'n1',
        nodeIds: ['n1'],
        failedNodeId: null,
        errorCode: null,
      },
    } as never)
    vi.mocked(useIsBranchRunning).mockReturnValue(true)
    renderNode()
    await userEvent.click(screen.getByRole('button', { name: /stop/i }))
    expect(cancel).toHaveBeenCalledTimes(1)
  })
})
