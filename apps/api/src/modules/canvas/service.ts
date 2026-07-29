// apps/api/src/modules/canvas/service.ts
// Canvas aggregate service (ADR canvas-mode D1) — mirrors films/service.ts:
// every method takes userId first and scopes through requireCanvas; a foreign
// id is indistinguishable from a missing one. The PATCH is a FULL-DOCUMENT
// replace (delete + reinsert nodes/edges in one transaction): last-write-wins
// is the chosen autosave semantic for single-owner docs, and replace is the
// only merge-free way to honor it.
//
// What this service deliberately does NOT do: run anything. A node RUN is an
// ordinary POST /api/generations from the SPA, so there is zero money code
// here — no ledger, no provider, no refund. The canvas only CITES generation
// ids (node.generationIds), exactly the way a shot cites one.
import { randomUUID } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import type {
  Canvas,
  CanvasDetail,
  CanvasEdge,
  CanvasNode,
  CreateCanvasInput,
  UpdateCanvasInput,
} from '@opencreate/contracts'
import type { Db } from '../../db/client'
import type { StorageProvider } from '../../storage/local'
import { InvalidImageDataUriError } from '../../storage/dataUri'
import { canvas, canvasEdge, canvasNode } from '../../db/schema'

export class CanvasNotFoundError extends Error {
  constructor() {
    super('Canvas not found')
    this.name = 'CanvasNotFoundError'
  }
}

// A rejected upload payload (svg, oversize, not raster) is the CLIENT's fault.
// A distinct class is what keeps it a 400 instead of letting a storage error
// escape as a 500 — the shot-references precedent.
export class CanvasValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CanvasValidationError'
  }
}

type Deps = { db: Db; storage: StorageProvider }

export type CanvasService = ReturnType<typeof createCanvasService>

export function createCanvasService({ db, storage }: Deps) {
  function toDto(row: typeof canvas.$inferSelect): Canvas {
    return {
      id: row.id,
      title: row.title,
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
    }
  }
  function toNodeDto(row: typeof canvasNode.$inferSelect): CanvasNode {
    return {
      id: row.id,
      kind: row.kind,
      position: JSON.parse(row.positionJson) as CanvasNode['position'],
      config: JSON.parse(row.configJson) as CanvasNode['config'],
      generationIds: JSON.parse(row.generationIdsJson) as string[],
      ...(row.uploadUrl !== null ? { uploadUrl: row.uploadUrl } : {}),
    }
  }
  function toEdgeDto(row: typeof canvasEdge.$inferSelect): CanvasEdge {
    return { id: row.id, sourceNodeId: row.sourceNodeId, targetNodeId: row.targetNodeId }
  }

  // Ownership gate — same error for foreign and missing (films precedent), so
  // an attacker cannot probe which canvas ids exist.
  function requireCanvas(userId: string, canvasId: string) {
    const row = db
      .select()
      .from(canvas)
      .where(and(eq(canvas.id, canvasId), eq(canvas.userId, userId)))
      .get()
    if (!row) throw new CanvasNotFoundError()
    return row
  }

  function createCanvas(userId: string, input: CreateCanvasInput): Canvas {
    const id = randomUUID()
    const now = new Date()
    db.insert(canvas)
      .values({ id, userId, title: input.title.trim(), createdAt: now, updatedAt: now })
      .run()
    return toDto(db.select().from(canvas).where(eq(canvas.id, id)).get()!)
  }

  function listCanvases(userId: string): Canvas[] {
    return db
      .select()
      .from(canvas)
      .where(eq(canvas.userId, userId))
      .orderBy(desc(canvas.updatedAt))
      .all()
      .map(toDto)
  }

  function getCanvas(userId: string, canvasId: string): CanvasDetail {
    const row = requireCanvas(userId, canvasId)
    const nodes = db.select().from(canvasNode).where(eq(canvasNode.canvasId, canvasId)).all()
    const edges = db.select().from(canvasEdge).where(eq(canvasEdge.canvasId, canvasId)).all()
    return {
      ...toDto(row),
      viewport: JSON.parse(row.viewportJson) as CanvasDetail['viewport'],
      nodes: nodes.map(toNodeDto),
      edges: edges.map(toEdgeDto),
    }
  }

  // Spec §5: the server, not just the client, owns document integrity. A raw
  // PATCH must never be able to persist a dangling edge, a self-edge or a
  // cycle — the blind delete+reinsert below has no other gate against them.
  // Runs BEFORE the transaction so a rejected document touches no rows.
  function validateGraph(input: UpdateCanvasInput): void {
    if (input.nodes === undefined && input.edges === undefined) return
    const nodeIds = new Set<string>()
    for (const node of input.nodes ?? []) {
      if (nodeIds.has(node.id)) throw new CanvasValidationError(`duplicate node id: ${node.id}`)
      nodeIds.add(node.id)
    }
    const edges = input.edges ?? []
    // Edge endpoints are only checkable against a node set the PATCH actually
    // carries — a title/viewport-only save (nodes undefined) has none to check.
    if (input.nodes !== undefined) {
      for (const edge of edges) {
        if (edge.sourceNodeId === edge.targetNodeId)
          throw new CanvasValidationError(`self-edge: ${edge.id}`)
        if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId))
          throw new CanvasValidationError(`edge ${edge.id} cites a missing node`)
      }
    }
    // Kahn's algorithm: repeatedly remove zero-indegree nodes. Any node left
    // over once the queue drains sits on a cycle.
    const indegree = new Map<string, number>()
    const adjacency = new Map<string, string[]>()
    for (const nid of nodeIds) {
      indegree.set(nid, 0)
      adjacency.set(nid, [])
    }
    for (const edge of edges) {
      adjacency.get(edge.sourceNodeId)?.push(edge.targetNodeId)
      indegree.set(edge.targetNodeId, (indegree.get(edge.targetNodeId) ?? 0) + 1)
    }
    const queue = [...indegree.entries()].filter(([, deg]) => deg === 0).map(([nid]) => nid)
    let visited = 0
    while (queue.length > 0) {
      const current = queue.pop()!
      visited += 1
      for (const next of adjacency.get(current) ?? []) {
        const deg = (indegree.get(next) ?? 0) - 1
        indegree.set(next, deg)
        if (deg === 0) queue.push(next)
      }
    }
    if (visited !== nodeIds.size) throw new CanvasValidationError('the graph contains a cycle')
  }

  // FULL-DOCUMENT autosave. Replace, not merge: the client owns the truth
  // between saves (single owner), so the stored doc must become exactly what
  // was sent. One transaction so a crash can never leave nodes without edges.
  function updateCanvas(userId: string, canvasId: string, input: UpdateCanvasInput): CanvasDetail {
    requireCanvas(userId, canvasId)
    validateGraph(input)
    db.transaction((tx) => {
      tx.update(canvas)
        .set({
          ...(input.title !== undefined ? { title: input.title.trim() } : {}),
          ...(input.viewport !== undefined
            ? { viewportJson: JSON.stringify(input.viewport) }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(canvas.id, canvasId))
        .run()
      // An ABSENT collection means "not part of this save" (a title-only
      // rename), an EMPTY one means "the document has none" — hence the
      // undefined check rather than a truthiness test.
      if (input.nodes !== undefined) {
        tx.delete(canvasNode).where(eq(canvasNode.canvasId, canvasId)).run()
        for (const node of input.nodes) {
          tx.insert(canvasNode)
            .values({
              id: node.id,
              canvasId,
              kind: node.kind,
              positionJson: JSON.stringify(node.position),
              configJson: JSON.stringify(node.config),
              generationIdsJson: JSON.stringify(node.generationIds),
              uploadUrl: node.uploadUrl ?? null,
            })
            .run()
        }
      }
      if (input.edges !== undefined) {
        tx.delete(canvasEdge).where(eq(canvasEdge.canvasId, canvasId)).run()
        for (const edge of input.edges) {
          tx.insert(canvasEdge)
            .values({
              id: edge.id,
              canvasId,
              sourceNodeId: edge.sourceNodeId,
              targetNodeId: edge.targetNodeId,
            })
            .run()
        }
      }
    })
    return getCanvas(userId, canvasId)
  }

  function deleteCanvas(userId: string, canvasId: string): void {
    requireCanvas(userId, canvasId)
    // FK cascade removes nodes and edges with the canvas row.
    db.delete(canvas).where(eq(canvas.id, canvasId)).run()
  }

  // Upload-node bytes → own storage → public '/media/…' path. Ownership FIRST:
  // a stranger must not be able to fill our disk through someone else's canvas.
  // saveDataUri → parseImageDataUri re-guards the DISK (raster mimes only, so no
  // svg stored-XSS; cap measured on decoded bytes), and a rejected payload maps
  // to a validation envelope exactly like shot-references does.
  async function saveUpload(
    userId: string,
    canvasId: string,
    dataUri: string,
  ): Promise<{ uploadUrl: string }> {
    requireCanvas(userId, canvasId)
    try {
      // Media key is independent of the node id: the doc is replaced whole on
      // every save, so a node id is not a stable name for a stored file.
      const uploadUrl = await storage.saveDataUri(dataUri, randomUUID())
      return { uploadUrl }
    } catch (err) {
      if (err instanceof InvalidImageDataUriError) throw new CanvasValidationError(err.message)
      throw err
    }
  }

  return { createCanvas, listCanvases, getCanvas, updateCanvas, deleteCanvas, saveUpload }
}
