// apps/web/src/modules/Canvas/components/CanvasEditor.tsx
// The React Flow shell (ADR canvas-mode D4). The STORE is the document truth;
// React Flow nodes/edges are DERIVED each render, and RF's change events write
// back: position → moveNode, remove → removeNode/removeEdge, connect →
// edgeRules → addEdge. Illegal wires are refused DURING the drag
// (isValidConnection), so a refused connection never reaches the document.
import { useCallback, useMemo } from 'react'
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
  const storeNodes = useCanvasStore((s) => s.nodes)
  const storeEdges = useCanvasStore((s) => s.edges)
  const moveNode = useCanvasStore((s) => s.moveNode)
  const removeNode = useCanvasStore((s) => s.removeNode)
  const addNode = useCanvasStore((s) => s.addNode)
  const addEdge = useCanvasStore((s) => s.addEdge)
  const removeEdge = useCanvasStore((s) => s.removeEdge)
  const setViewport = useCanvasStore((s) => s.setViewport)
  const { screenToFlowPosition } = useReactFlow()

  // Derived RF objects. The store's array identity changes only on real edits,
  // so this memo is what keeps dragging one node from rebuilding the rest.
  const rfNodes: Node[] = useMemo(
    () =>
      storeNodes.map((n) => ({
        id: n.id,
        type: n.kind,
        position: n.position,
        data: { models },
      })),
    [storeNodes, models],
  )
  const rfEdges: Edge[] = useMemo(
    () => storeEdges.map((e) => ({ id: e.id, source: e.sourceNodeId, target: e.targetNodeId })),
    [storeEdges],
  )

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const change of changes) {
        // Write positions on drag END only — one store write (and one autosave
        // arm) per gesture instead of sixty per second.
        if (change.type === 'position' && change.dragging === false && change.position) {
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
        className="min-w-0 flex-1"
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
