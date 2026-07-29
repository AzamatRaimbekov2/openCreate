// I6 (fix-wave): a loaded canvas with zero nodes rendered a blank board — the
// project's 4-states law (loading/empty/error/data) requires an empty state
// here too. This pins the hint appearing on an empty doc and disappearing
// once a node exists. @xyflow/react needs ResizeObserver to measure nodes;
// jsdom ships none, so this file stubs a no-op one (scoped to this file only).
import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CanvasDetail } from '@opencreate/contracts'
import { useCanvasStore } from '../model/canvasStore'
import { CanvasEditor } from './CanvasEditor'
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
  nodes: [],
  edges: [],
  createdAt: '2026-07-30T00:00:00.000Z',
  updatedAt: '2026-07-30T00:00:00.000Z',
}

beforeEach(() => {
  useCanvasStore.getState().reset()
  useCanvasStore.getState().init(DOC)
})

describe('CanvasEditor empty-state hint (I6)', () => {
  it('shows a hint pointing at the palette when the board has no nodes', () => {
    render(<CanvasEditor models={[]} />)
    expect(screen.getByText('Drag your first node from the palette')).toBeInTheDocument()
  })

  it('hides the hint once a node exists', () => {
    render(<CanvasEditor models={[]} />)
    expect(screen.getByText('Drag your first node from the palette')).toBeInTheDocument()
    act(() => {
      useCanvasStore.getState().addNode('note', { x: 0, y: 0 })
    })
    expect(screen.queryByText('Drag your first node from the palette')).not.toBeInTheDocument()
  })
})
