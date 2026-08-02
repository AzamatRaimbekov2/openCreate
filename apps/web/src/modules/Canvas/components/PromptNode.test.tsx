// The shared-prompt card (ADR canvas-prompt-node). It is FURNITURE: it never
// runs, never costs, takes no input — and its whole job is that its text lands
// in the document so every wired child composes with it.
// @xyflow/react needs ResizeObserver for Handle measurement; jsdom ships none.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReactFlowProvider } from '@xyflow/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CanvasDetail } from '@opencreate/contracts'
import { useCanvasStore } from '../model/canvasStore'
import { PromptNode } from './PromptNode'
import 'shared/config/i18n'

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub)

const DOC: CanvasDetail = {
  id: 'c1',
  title: 'T',
  viewport: { x: 0, y: 0, zoom: 1 },
  nodes: [
    { id: 't1', kind: 'prompt', position: { x: 0, y: 0 }, config: {}, generationIds: [] },
    {
      id: 'n1',
      kind: 'image',
      position: { x: 300, y: 0 },
      config: { prompt: 'a fox', modelId: 'flux-dev' },
      generationIds: [],
    },
    {
      id: 'n2',
      kind: 'image',
      position: { x: 300, y: 300 },
      config: { prompt: 'a bear', modelId: 'flux-dev' },
      generationIds: [],
    },
  ],
  edges: [],
  createdAt: '2026-08-02T00:00:00.000Z',
  updatedAt: '2026-08-02T00:00:00.000Z',
}

// The enhance sparkle drives a mutation, so the card needs a query client.
function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={queryClient}>
      <ReactFlowProvider>{children}</ReactFlowProvider>
    </QueryClientProvider>
  )
}

const renderNode = () => render(<PromptNode id="t1" />, { wrapper })

beforeEach(() => {
  useCanvasStore.getState().reset()
  useCanvasStore.getState().init(DOC)
})

describe('PromptNode', () => {
  it('writes its text into the DOCUMENT, so autosave and every child see it', async () => {
    renderNode()
    await userEvent.type(screen.getByRole('textbox'), 'neon')
    expect(useCanvasStore.getState().nodes[0]?.config.prompt).toBe('neon')
  })

  it('carries the enhance sparkle — the one field where improving it lifts every child', () => {
    renderNode()
    // Owner law (2026-07-30): every prompt field has the sparkle.
    expect(screen.getByRole('button', { name: /enhance prompt/i })).toBeInTheDocument()
  })

  it('never runs: no Generate, no price, and the status stays idle', () => {
    renderNode()
    expect(screen.queryByRole('button', { name: /generate/i })).not.toBeInTheDocument()
    expect(screen.getByText('idle')).toBeInTheDocument()
  })

  it('says how many nodes it feeds — the one fact that justifies a shared card', () => {
    useCanvasStore.getState().addEdge('t1', 'n1')
    useCanvasStore.getState().addEdge('t1', 'n2')
    renderNode()
    expect(screen.getByText(/feeds 2 nodes/i)).toBeInTheDocument()
  })

  it('wired to nothing, it says what to DO instead of printing "feeds 0 nodes"', () => {
    // "0 nodes" is a number pretending to be information; the empty state of a
    // card whose whole job is reach has to name the next action.
    renderNode()
    expect(screen.getByText(/wire it into an image or video node/i)).toBeInTheDocument()
    expect(screen.queryByText(/feeds 0/i)).toBeNull()
  })
})
