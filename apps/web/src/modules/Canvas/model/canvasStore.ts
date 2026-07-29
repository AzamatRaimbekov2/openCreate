// apps/web/src/modules/Canvas/model/canvasStore.ts
// Editing truth for ONE open canvas. Singleton + init()/reset() on route
// change (the wizardStore per-document discipline — no store factories).
// Server truth lives in TanStack Query; this store holds what the server has
// no opinion about between saves: the working document + save status.
// Every mutating action flips saveState to 'dirty'; the autosave loop
// (useCanvasDoc) watches that flag, debounces, PATCHes and calls markSaved.
import { create } from 'zustand'
import type {
  CanvasDetail,
  CanvasEdge,
  CanvasNode,
  CanvasNodeConfig,
  CanvasNodeKind,
  CanvasViewport,
} from '@opencreate/contracts'

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error'

type CanvasStore = {
  canvasId: string | null
  title: string
  viewport: CanvasViewport
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  saveState: SaveState
  init: (doc: CanvasDetail) => void
  reset: () => void
  setTitle: (title: string) => void
  setViewport: (viewport: CanvasViewport) => void
  addNode: (kind: CanvasNodeKind, position: { x: number; y: number }) => void
  moveNode: (id: string, position: { x: number; y: number }) => void
  updateNodeConfig: (id: string, patch: Partial<CanvasNodeConfig>) => void
  setUploadUrl: (id: string, uploadUrl: string) => void
  appendGeneration: (id: string, generationId: string) => void
  removeNode: (id: string) => void
  addEdge: (sourceNodeId: string, targetNodeId: string) => void
  removeEdge: (id: string) => void
  markSaving: () => void
  markSaved: () => void
  markSaveError: () => void
}

const INITIAL = {
  canvasId: null,
  title: '',
  viewport: { x: 0, y: 0, zoom: 1 },
  nodes: [] as CanvasNode[],
  edges: [] as CanvasEdge[],
  saveState: 'saved' as SaveState,
}

// crypto.randomUUID is available in every target browser and jsdom. Ids only
// need to be unique WITHIN one canvas (≤200 nodes), so 8 hex chars is ample
// and keeps the stored document small — the server never joins on them.
const mintId = () => crypto.randomUUID().slice(0, 8)

export const useCanvasStore = create<CanvasStore>((set) => ({
  ...INITIAL,

  init: (doc) =>
    set({
      canvasId: doc.id,
      title: doc.title,
      viewport: doc.viewport,
      nodes: doc.nodes,
      edges: doc.edges,
      saveState: 'saved',
    }),
  reset: () => set({ ...INITIAL }),

  setTitle: (title) => set({ title, saveState: 'dirty' }),
  setViewport: (viewport) => set({ viewport, saveState: 'dirty' }),

  addNode: (kind, position) =>
    set((s) => ({
      nodes: [...s.nodes, { id: mintId(), kind, position, config: {}, generationIds: [] }],
      saveState: 'dirty',
    })),
  moveNode: (id, position) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, position } : n)),
      saveState: 'dirty',
    })),
  updateNodeConfig: (id, patch) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, config: { ...n.config, ...patch } } : n)),
      saveState: 'dirty',
    })),
  setUploadUrl: (id, uploadUrl) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, uploadUrl } : n)),
      saveState: 'dirty',
    })),
  appendGeneration: (id, generationId) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, generationIds: [...n.generationIds, generationId] } : n,
      ),
      saveState: 'dirty',
    })),
  // Deleting a parent removes its EDGES only — children keep citing their own
  // generations (spec §5: they cite generation ids, not the parent).
  removeNode: (id) =>
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.sourceNodeId !== id && e.targetNodeId !== id),
      saveState: 'dirty',
    })),

  addEdge: (sourceNodeId, targetNodeId) =>
    set((s) => ({
      edges: [...s.edges, { id: mintId(), sourceNodeId, targetNodeId }],
      saveState: 'dirty',
    })),
  removeEdge: (id) =>
    set((s) => ({ edges: s.edges.filter((e) => e.id !== id), saveState: 'dirty' })),

  markSaving: () => set({ saveState: 'saving' }),
  // Saved only if nothing changed while the PATCH was in flight — the autosave
  // loop re-checks; a mid-save edit stays dirty and triggers another save.
  markSaved: () =>
    set((s) => (s.saveState === 'saving' || s.saveState === 'dirty' ? { saveState: 'saved' } : {})),
  markSaveError: () => set({ saveState: 'error' }),
}))
