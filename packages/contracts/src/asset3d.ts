// Modular 3D Assets wire contracts (ADR: docs/wiki/decisions/modular-3d-assets.md).
// An `asset3d` is an aggregate that CITES generations by id — it never owns media,
// exactly like Film/Shot. A part's image and mesh are ordinary generations; the
// row holds only their (nullable) foreign keys. Part STATUS is DERIVED at read
// time from those cited generations' statuses — there is NO status COLUMN (the
// films/shots lesson: a persisted status is a second source of truth, a bug
// class). It DOES appear on the read DTO (`asset3dPartSchema.status`) because the
// ADR GET endpoint returns "asset + parts + derived statuses"; it is recomputed
// on every read, never stored, and is REJECTED on every input schema. Provenance
// the server establishes (userId, createdAt, the citations, the derived status)
// never appears in create/patch inputs.
import { z } from 'zod'

// The closed set of derived part states (D4). Order = the extraction→mesh flow:
// draft → extracting → extracted → meshing → ready.
export const partStatusSchema = z.enum(['draft', 'extracting', 'extracted', 'meshing', 'ready'])
export type PartStatus = z.infer<typeof partStatusSchema>

// Hard cap on analyze output AND on manual parts — a multi-GLB assembly stresses
// VRAM, and the ADR bounds it. Enforced here (contract) and server-side.
export const MAX_PARTS = 12

// Concept + part uploads: anchored data-uri regex with the `;base64,` boundary
// (a `.startsWith()` check has a prefix-boundary hole — model-render.ts precedent).
// svg is excluded on purpose (stored-XSS). 14MB cap tracks generation.inputImage.
const MAX_IMAGE_CHARS = 14_000_000
const dataUriImage = z
  .string()
  .regex(/^data:image\/(png|jpe?g|webp);base64,/, 'must be a png/jpeg/webp data URI')
  .max(MAX_IMAGE_CHARS)

// ── Assembly transform (client-side, renderer-agnostic, Y-up / meters, glTF) ──
const vec3 = z.tuple([z.number(), z.number(), z.number()])
export const partTransformSchema = z.object({
  position: vec3,
  rotation: vec3, // Euler radians, XYZ
  scale: vec3,
})
export type PartTransform = z.infer<typeof partTransformSchema>

// ── Part DTO — cites generations, carries a DERIVED (never persisted) status ──
export const asset3dPartSchema = z.object({
  id: z.string(),
  assetId: z.string(),
  name: z.string(),
  description: z.string(),
  sortOrder: z.number(),
  // Citations: the extraction image and the mesh, each null until generated.
  imageGenerationId: z.string().nullable(),
  meshGenerationId: z.string().nullable(),
  // Assembly transform; null until the user places the part in the viewer.
  transform: partTransformSchema.nullable(),
  // Derived at read time from the cited generations' live statuses — recomputed
  // per GET, never stored (no status column). Output-only: no input schema has it.
  status: partStatusSchema,
  createdAt: z.string(),
})
export type Asset3dPart = z.infer<typeof asset3dPartSchema>

// ── Asset DTO ────────────────────────────────────────────────────────────────
export const asset3dSchema = z.object({
  id: z.string(),
  title: z.string(),
  // Our stored /media key for the concept image (never a provider URL — those
  // expire after 7 days). Served path once saved.
  conceptImageUrl: z.string(),
  createdAt: z.string(),
})
export type Asset3d = z.infer<typeof asset3dSchema>

// ── Inputs ───────────────────────────────────────────────────────────────────
// No generation ids, no status: the server sets citations via extract/mesh.
export const createAsset3dInputSchema = z.object({
  title: z.string().min(1).max(120),
  conceptImage: dataUriImage,
})
export type CreateAsset3dInput = z.infer<typeof createAsset3dInputSchema>

export const updateAsset3dInputSchema = z.object({ title: z.string().min(1).max(120) }).partial()
export type UpdateAsset3dInput = z.infer<typeof updateAsset3dInputSchema>

export const createAsset3dPartInputSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(600).optional(),
})
export type CreateAsset3dPartInput = z.infer<typeof createAsset3dPartInputSchema>

// PATCH: every field optional; `transform: null` clears, absent = untouched. No
// generation-id fields — the citations are set only by extract/mesh routes.
export const updateAsset3dPartInputSchema = z
  .object({
    name: z.string().min(1).max(80),
    description: z.string().max(600),
    transform: partTransformSchema.nullable(),
  })
  .partial()
export type UpdateAsset3dPartInput = z.infer<typeof updateAsset3dPartInputSchema>

// Mesh: the ONLY thing the client picks is the tier (a model3d catalog id). The
// server supplies the part image and composes the job. No prompt, no model
// composition leaks to the client (the server-model rule).
export const meshPartInputSchema = z.object({ modelId: z.string().min(1).max(80) })
export type MeshPartInput = z.infer<typeof meshPartInputSchema>

// ── Composite read shape ─────────────────────────────────────────────────────
export const asset3dDetailSchema = z.object({
  asset: asset3dSchema,
  parts: z.array(asset3dPartSchema),
})
export type Asset3dDetail = z.infer<typeof asset3dDetailSchema>

export const asset3dListSchema = z.object({ items: z.array(asset3dSchema) })
export type Asset3dList = z.infer<typeof asset3dListSchema>

// ── Analyze (FREE Claude vision) — validated on the way OUT of the model, like
// storyboard. A draft part is just a name + description; nothing is charged.
export const analyzePartSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(600),
})
export type AnalyzePart = z.infer<typeof analyzePartSchema>
export const analyzeResponseSchema = z.object({ parts: z.array(analyzePartSchema).min(1).max(MAX_PARTS) })
export type AnalyzeResponse = z.infer<typeof analyzeResponseSchema>
