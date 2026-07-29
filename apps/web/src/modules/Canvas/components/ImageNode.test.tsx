// The image node's 4 preview states + the Generate gate (disabled without a
// runnable input). Hooks are mocked; React Flow needs its provider for Handle.
import { render, screen } from '@testing-library/react'
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
]

function renderNode() {
  return render(
    <ReactFlowProvider>
      <ImageNode id="n1" data={{ models: MODELS }} />
    </ReactFlowProvider>,
  )
}

const gen = (status: Generation['status']): Generation =>
  ({
    id: 'g1',
    type: 'image',
    mode: 'text',
    status,
    prompt: 'a fox',
    modelId: 'flux-dev',
    params: { aspectRatio: '1:1' },
    costCredits: 2,
    mediaUrls: status === 'succeeded' ? ['/media/g1.webp'] : [],
    errorMessage: status === 'failed' ? 'provider down' : null,
    createdAt: '2026-07-30T00:00:00.000Z',
    completedAt: null,
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

  it('disables Generate when the prompt is empty', () => {
    useCanvasStore.getState().updateNodeConfig('n1', { prompt: '' })
    renderNode()
    expect(screen.getByRole('button', { name: /generate/i })).toBeDisabled()
  })
})
