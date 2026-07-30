// The image node's 4 preview states + the Generate gate (disabled without a
// runnable input). Hooks are mocked; React Flow needs its provider for Handle.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReactFlowProvider } from '@xyflow/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Generation } from '@opencreate/contracts'
import type { CanvasModelOption } from '../model/types'
import { useCanvasStore } from '../model/canvasStore'
import { useNodeGeneration, useRunNode } from '../model/useNodeGeneration'
import { ImageNode } from './ImageNode'

vi.mock('../model/useNodeGeneration', async (importOriginal) => {
  const original = await importOriginal<typeof import('../model/useNodeGeneration')>()
  return { ...original, useRunNode: vi.fn(), useNodeGeneration: vi.fn() }
})
const mockRun = vi.mocked(useRunNode)
const mockPoll = vi.mocked(useNodeGeneration)

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
})
