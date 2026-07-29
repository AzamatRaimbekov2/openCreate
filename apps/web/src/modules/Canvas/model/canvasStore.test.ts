// The store is the editing truth: init from a loaded doc, node/edge edits mark
// it dirty, reset clears everything (wizardStore per-document discipline).
import { beforeEach, describe, expect, it } from 'vitest'
import { useCanvasStore } from './canvasStore'

const DOC = {
  id: 'c1',
  title: 'Fox chain',
  viewport: { x: 0, y: 0, zoom: 1 },
  nodes: [
    {
      id: 'n1',
      kind: 'image' as const,
      position: { x: 0, y: 0 },
      config: { prompt: 'a fox', modelId: 'flux-dev', aspectRatio: '1:1' as const },
      generationIds: [],
    },
  ],
  edges: [],
  createdAt: '2026-07-30T00:00:00.000Z',
  updatedAt: '2026-07-30T00:00:00.000Z',
}

beforeEach(() => useCanvasStore.getState().reset())

describe('useCanvasStore', () => {
  it('init loads the document and reads as saved', () => {
    useCanvasStore.getState().init(DOC)
    const s = useCanvasStore.getState()
    expect(s.canvasId).toBe('c1')
    expect(s.nodes).toHaveLength(1)
    expect(s.saveState).toBe('saved')
  })

  it('addNode / updateNodeConfig / moveNode / removeNode mark dirty', () => {
    useCanvasStore.getState().init(DOC)
    const s = () => useCanvasStore.getState()
    s().addNode('note', { x: 50, y: 60 })
    expect(s().nodes).toHaveLength(2)
    expect(s().saveState).toBe('dirty')

    s().markSaved()
    s().updateNodeConfig('n1', { prompt: 'a red fox' })
    expect(s().nodes[0]?.config.prompt).toBe('a red fox')
    expect(s().saveState).toBe('dirty')

    s().markSaved()
    s().moveNode('n1', { x: 99, y: 1 })
    expect(s().nodes[0]?.position).toEqual({ x: 99, y: 1 })
    expect(s().saveState).toBe('dirty')

    s().markSaved()
    s().removeNode('n1')
    expect(s().nodes.find((n) => n.id === 'n1')).toBeUndefined()
    expect(s().saveState).toBe('dirty')
  })

  it('removing a node removes its edges; children keep their generations', () => {
    useCanvasStore.getState().init({
      ...DOC,
      nodes: [
        ...DOC.nodes,
        {
          id: 'n2',
          kind: 'video' as const,
          position: { x: 200, y: 0 },
          config: {},
          generationIds: ['gv1'],
        },
      ],
      edges: [{ id: 'e1', sourceNodeId: 'n1', targetNodeId: 'n2' }],
    })
    useCanvasStore.getState().removeNode('n1')
    const s = useCanvasStore.getState()
    expect(s.edges).toHaveLength(0)
    expect(s.nodes.find((n) => n.id === 'n2')?.generationIds).toEqual(['gv1'])
  })

  it('addEdge appends; appendGeneration grows the version history', () => {
    useCanvasStore.getState().init(DOC)
    useCanvasStore.getState().addNode('video', { x: 300, y: 0 })
    const videoId = useCanvasStore.getState().nodes[1]?.id ?? ''
    useCanvasStore.getState().addEdge('n1', videoId)
    expect(useCanvasStore.getState().edges).toHaveLength(1)

    useCanvasStore.getState().appendGeneration('n1', 'g-new')
    expect(useCanvasStore.getState().nodes[0]?.generationIds).toEqual(['g-new'])
  })

  it('markSaved must NOT clear a mid-save edit (I3): an edit while saving stays dirty', () => {
    // markSaving() -> a PATCH is in flight. An edit lands DURING that flight
    // (saveState flips 'saving' -> 'dirty'). The in-flight PATCH's eventual
    // markSaved() must not stomp that edit back to 'saved' — the edit was
    // never sent, so the autosave loop must re-fire for it.
    useCanvasStore.getState().init(DOC)
    useCanvasStore.getState().markSaving()
    useCanvasStore.getState().updateNodeConfig('n1', { prompt: 'edited mid-save' })
    expect(useCanvasStore.getState().saveState).toBe('dirty')
    useCanvasStore.getState().markSaved()
    expect(useCanvasStore.getState().saveState).toBe('dirty')
  })

  it('mints a FULL crypto.randomUUID for new node/edge ids (I1: global PK, not just canvas-unique)', () => {
    // canvas_node.id / canvas_edge.id are GLOBAL primary keys server-side, not
    // scoped to one canvas — an 8-char slice collides across canvases and
    // surfaces as an unmapped SQLite UNIQUE error (500) for an innocent user.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    useCanvasStore.getState().init(DOC)
    useCanvasStore.getState().addNode('note', { x: 1, y: 2 })
    const newNode = useCanvasStore.getState().nodes.at(-1)
    expect(newNode?.id).toMatch(UUID_RE)

    useCanvasStore.getState().addEdge('n1', newNode!.id)
    const newEdge = useCanvasStore.getState().edges.at(-1)
    expect(newEdge?.id).toMatch(UUID_RE)
  })

  it('reset returns to the empty state', () => {
    useCanvasStore.getState().init(DOC)
    useCanvasStore.getState().reset()
    const s = useCanvasStore.getState()
    expect(s.canvasId).toBeNull()
    expect(s.nodes).toHaveLength(0)
  })
})
