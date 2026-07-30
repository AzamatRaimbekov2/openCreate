// apps/web/src/modules/Canvas/components/CanvasEditor.tsx
// The React Flow shell (ADR canvas-mode D4). The STORE is the document truth;
// React Flow nodes/edges are DERIVED each render, and RF's change events write
// back: position → moveNode, remove → removeNode/removeEdge, connect →
// edgeRules → addEdge. Illegal wires are refused DURING the drag
// (isValidConnection), so a refused connection never reaches the document.
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeTypes,
} from '@xyflow/react'
// Vendor stylesheet — the one CSS import allowed outside theme.css, same
// standing as the font packages. React Flow cannot draw wires without it.
import '@xyflow/react/dist/style.css'
import type { CanvasNodeKind } from '@opencreate/contracts'
import type { CanvasModelOption } from '../model/types'
import { canConnect } from '../model/edgeRules'
import { useCanvasStore } from '../model/canvasStore'
import { ImageNode } from './ImageNode'
import { VideoNode } from './VideoNode'
import { UploadNode } from './UploadNode'
import { NoteNode } from './NoteNode'
import { NODE_KIND_MIME, NodePalette } from './NodePalette'

// Module scope on purpose: a nodeTypes object rebuilt per render makes React
// Flow re-register (and remount) every node on every keystroke.
const nodeTypes: NodeTypes = {
  image: ImageNode,
  video: VideoNode,
  upload: UploadNode,
  note: NoteNode,
}

// Dot grid tuned to the surface ladder: `ridge` is one step above the steel
// cards, so the texture reads as depth behind them rather than as noise on top.
const GRID_COLOR = '#314062'

function EditorInner({ models }: { models: CanvasModelOption[] }) {
  const { t } = useTranslation()
  const storeNodes = useCanvasStore((s) => s.nodes)
  const storeEdges = useCanvasStore((s) => s.edges)
  const moveNode = useCanvasStore((s) => s.moveNode)
  const removeNode = useCanvasStore((s) => s.removeNode)
  const addNode = useCanvasStore((s) => s.addNode)
  const addEdge = useCanvasStore((s) => s.addEdge)
  const removeEdge = useCanvasStore((s) => s.removeEdge)
  const setViewport = useCanvasStore((s) => s.setViewport)
  const { screenToFlowPosition } = useReactFlow()

  // Derived RF objects — with PER-NODE identity preservation, and that part is
  // load-bearing, not an optimization. React Flow v12 treats a node object
  // with a new identity as unmeasured and hides it (`visibility: hidden`) for
  // a frame until its ResizeObserver answers; if the focused textarea sits
  // inside that node, the browser drops focus to <body> on that frame. Naively
  // rebuilding every RF object per store write therefore ate every keystroke
  // after the first (found live 2026-07-30). The ref cache returns the SAME
  // object while id/kind/position/data are unchanged, so a config edit —
  // which only touches the store — causes zero RF node changes.
  // A state-held Map (never re-set) rather than a ref: the react-hooks lint
  // forbids ref reads during render, and this is exactly the "memoization
  // cache" mutation React permits in render — idempotent, same inputs → same
  // objects, StrictMode-double-render safe.
  const [rfNodeCache] = useState(() => new Map<string, Node>())
  const rfNodes: Node[] = useMemo(() => {
    const cache = rfNodeCache
    const seen = new Set<string>()
    const mapped = storeNodes.map((n) => {
      seen.add(n.id)
      const prev = cache.get(n.id)
      if (
        prev &&
        prev.type === n.kind &&
        prev.position.x === n.position.x &&
        prev.position.y === n.position.y &&
        (prev.data as { models: CanvasModelOption[] }).models === models
      ) {
        return prev
      }
      const next: Node = { id: n.id, type: n.kind, position: n.position, data: { models } }
      cache.set(n.id, next)
      return next
    })
    // Deleted nodes must not pin their last RF object forever.
    for (const key of cache.keys()) if (!seen.has(key)) cache.delete(key)
    return mapped
  }, [storeNodes, models, rfNodeCache])
  const rfEdges: Edge[] = useMemo(
    () => storeEdges.map((e) => ({ id: e.id, source: e.sourceNodeId, target: e.targetNodeId })),
    [storeEdges],
  )

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const change of changes) {
        // Apply positions on EVERY frame of the drag, not only on release. In
        // controlled React Flow the node moves ONLY when the `nodes` prop
        // reflects each intermediate position — writing on dragEnd alone left
        // the card frozen under the cursor and teleporting on drop (owner
        // report 2026-07-30). Per-frame store writes are cheap (the rfNodes
        // cache rebuilds just the dragged node), and autosave still PATCHes
        // once per gesture: the debounce arms on the saved→dirty TRANSITION,
        // so sixty dirty writes ride one timer.
        if (change.type === 'position' && change.position) {
          moveNode(change.id, change.position)
        }
        if (change.type === 'remove') removeNode(change.id)
      }
    },
    [moveNode, removeNode],
  )
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      for (const change of changes) {
        if (change.type === 'remove') removeEdge(change.id)
      }
    },
    [removeEdge],
  )
  // Runs while the user drags a wire: an invalid target simply refuses to snap.
  const isValidConnection = useCallback(
    (connection: Connection | Edge) =>
      connection.source !== null &&
      connection.target !== null &&
      canConnect(connection.source, connection.target, storeNodes, storeEdges).ok,
    [storeNodes, storeEdges],
  )
  // ...and again on drop, because isValidConnection is a UI affordance while
  // this is the write path. The document must never hold a refused edge.
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return
      if (!canConnect(connection.source, connection.target, storeNodes, storeEdges).ok) return
      addEdge(connection.source, connection.target)
    },
    [storeNodes, storeEdges, addEdge],
  )

  return (
    <div className="flex min-h-0 flex-1">
      <NodePalette
        onAdd={(kind) =>
          addNode(
            kind,
            screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }),
          )
        }
      />
      <div
        className="relative min-w-0 flex-1"
        onDragOver={(e) => {
          // Only claim the drop when the payload is OURS — otherwise a file
          // dragged onto the page would be swallowed by the canvas.
          if (e.dataTransfer.types.includes(NODE_KIND_MIME)) e.preventDefault()
        }}
        onDrop={(e) => {
          const kind = e.dataTransfer.getData(NODE_KIND_MIME)
          if (!kind) return
          e.preventDefault()
          addNode(
            kind as CanvasNodeKind,
            screenToFlowPosition({ x: e.clientX, y: e.clientY }),
          )
        }}
      >
        {/* I6: the 4th UI state (project 4-states law) — a loaded canvas with
            zero nodes is otherwise a blank void, indistinguishable from a
            still-loading or broken board. pointer-events-none so the hint
            never steals a pan/click from React Flow underneath; it disappears
            the instant a node exists (storeNodes drives it directly, no
            separate "dismissed" flag to get out of sync). z-10 keeps it above
            the dot-grid background/canvas but the palette (a sibling, not a
            child, of this div) is never covered. */}
        {storeNodes.length === 0 ? (
          <div
            role="status"
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-6"
          >
            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-steel px-4 py-3 text-xs text-mist-dim">
              <span aria-hidden="true">←</span>
              <span>{t('canvas.board.emptyHint')}</span>
            </div>
          </div>
        ) : null}
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          // The camera is part of the document: the owner reopens where they left.
          onMoveEnd={(_event, viewport) => setViewport(viewport)}
          defaultViewport={useCanvasStore.getState().viewport}
          selectionOnDrag
          panOnScroll
          proOptions={{ hideAttribution: true }}
          className="bg-void"
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color={GRID_COLOR} />
          <MiniMap position="bottom-right" pannable zoomable className="!bg-abyss" />
          <Controls position="bottom-left" showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  )
}

export function CanvasEditor({ models }: { models: CanvasModelOption[] }) {
  return (
    <ReactFlowProvider>
      <EditorInner models={models} />
    </ReactFlowProvider>
  )
}
