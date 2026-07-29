// Canvas Mode wire contracts (ADR: canvas-mode). The canvas is an aggregate
// that CITES generations (like film.ts): nodes hold config + an append-only
// generationIds history; money and media stay in the generation system.
// PATCH carries the FULL document (debounced autosave, last-write-wins,
// single-owner) — so every collection here is bounded to keep one hostile
// PATCH from persisting megabytes.
import { z } from 'zod'

// The 7 MVP node kinds (owner-locked in the 2026-07-29 brainstorm).
export const canvasNodeKindSchema = z.enum([
  'image',
  'video',
  'upload',
  'character',
  'upscale',
  'remove-bg',
  'note',
])
export type CanvasNodeKind = z.infer<typeof canvasNodeKindSchema>

export const canvasViewportSchema = z.object({
  x: z.number(),
  y: z.number(),
  // React Flow's own zoom bounds; clamped here so a corrupt save can't zero it.
  zoom: z.number().min(0.05).max(4),
})
export type CanvasViewport = z.infer<typeof canvasViewportSchema>

// Per-kind config travels as ONE loose-but-bounded object rather than a
// discriminated union on purpose: the editor evolves node fields quickly, and
// the server never interprets config (it only stores it — node runs go through
// POST /api/generations, which does its own strict validation). The bounds are
// the contract: strings capped, unknown keys dropped by the shape below
// (z.object strips unknown keys by default in zod 4).
export const canvasNodeConfigSchema = z.object({
  prompt: z.string().max(2000).optional(),
  modelId: z.string().max(80).optional(),
  aspectRatio: z.enum(['16:9', '1:1', '9:16']).optional(),
  duration: z.number().int().min(1).max(15).optional(),
  // character node: which Soul entity this card supplies downstream.
  entityId: z.string().max(80).optional(),
  // note node: the sticky's text.
  text: z.string().max(2000).optional(),
})
export type CanvasNodeConfig = z.infer<typeof canvasNodeConfigSchema>

export const canvasNodeSchema = z.object({
  // Client-minted (nanoid/uuid) — the doc is replaced whole, ids only need to
  // be unique within the canvas; the server never joins on them.
  id: z.string().min(1).max(40),
  kind: canvasNodeKindSchema,
  position: z.object({ x: z.number(), y: z.number() }),
  config: canvasNodeConfigSchema,
  // Append-only run history; latest succeeded id = the node's output. Bounded:
  // 50 versions is far beyond real use and keeps the doc small.
  generationIds: z.array(z.string().max(60)).max(50).default([]),
  // Upload nodes only: the stored '/media/…' path (server-minted by the upload
  // route, never an arbitrary URL — enforced by the prefix check).
  uploadUrl: z.string().max(300).startsWith('/media/').optional(),
})
export type CanvasNode = z.infer<typeof canvasNodeSchema>

export const canvasEdgeSchema = z.object({
  id: z.string().min(1).max(40),
  sourceNodeId: z.string().min(1).max(40),
  targetNodeId: z.string().min(1).max(40),
})
export type CanvasEdge = z.infer<typeof canvasEdgeSchema>

// List row (GET /api/canvases) — no nodes/edges, the list stays light.
export const canvasSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Canvas = z.infer<typeof canvasSchema>

// Full document (GET /api/canvases/:id).
export const canvasDetailSchema = canvasSchema.extend({
  viewport: canvasViewportSchema,
  nodes: z.array(canvasNodeSchema),
  edges: z.array(canvasEdgeSchema),
})
export type CanvasDetail = z.infer<typeof canvasDetailSchema>

export const createCanvasInputSchema = z.object({
  title: z.string().min(1).max(120),
})
export type CreateCanvasInput = z.infer<typeof createCanvasInputSchema>

// Autosave PATCH: the full node/edge document, all fields optional so a
// title-only rename stays a one-key body. Bounds: 200 nodes / 400 edges —
// full-document autosave is O(doc), and the ADR consciously accepts that for
// MVP-scale canvases (revisit with op-based patches beyond that).
export const updateCanvasInputSchema = z
  .object({
    title: z.string().min(1).max(120),
    viewport: canvasViewportSchema,
    nodes: z.array(canvasNodeSchema).max(200),
    edges: z.array(canvasEdgeSchema).max(400),
  })
  .partial()
export type UpdateCanvasInput = z.infer<typeof updateCanvasInputSchema>

export const canvasListSchema = z.object({ items: z.array(canvasSchema) })
export type CanvasList = z.infer<typeof canvasListSchema>

// Upload-node bytes → POST /api/canvases/:id/uploads. Same data-URI-only rule
// as addShotReferenceInputSchema (never a URL — SSRF), same 14MB-ish cap as
// generation.inputImage. Response: { uploadUrl: '/media/<uuid>.<ext>' }.
export const canvasUploadInputSchema = z.object({
  dataUri: z.string().startsWith('data:image/').max(14_000_000),
})
export type CanvasUploadInput = z.infer<typeof canvasUploadInputSchema>

export const canvasUploadResultSchema = z.object({
  uploadUrl: z.string().startsWith('/media/'),
})
export type CanvasUploadResult = z.infer<typeof canvasUploadResultSchema>
