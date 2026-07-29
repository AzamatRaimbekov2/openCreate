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

// I1 fix: canvas_node.id / canvas_edge.id are GLOBAL primary keys server-side
// (every canvas's rows share one table), NOT scoped to a single document. An
// 8-char slice of a UUID collides across canvases at meaningful odds and
// surfaces as an unmapped SQLite UNIQUE-constraint error — a 500 for an
// innocent user. The full 36-char UUID is what the PK actually needs to stay
// unique; it still fits the contract's 40-char id cap (canvasNodeSchema /
// canvasEdgeSchema) with room to spare.
const mintId = () => crypto.randomUUID()

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
  // I3 fix: guard on 'saving' ONLY. An edit made while a PATCH is in flight
  // flips saveState 'saving' -> 'dirty' (any mutator does that); the OLD code
  // also matched 'dirty' here, so the in-flight PATCH's eventual markSaved()
  // stomped that edit straight to 'saved' — it was never actually sent, and
  // the autosave subscriber (which only re-arms on a 'dirty' TRANSITION)
  // never re-fired for it. Matching 'saving' alone means a mid-save edit
  // stays 'dirty' and the loop re-saves it.
  markSaved: () => set((s) => (s.saveState === 'saving' ? { saveState: 'saved' } : {})),
  markSaveError: () => set({ saveState: 'error' }),
}))
