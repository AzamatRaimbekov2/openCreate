// apps/api/src/modules/assets3d/service.ts
// Modular 3D Assets domain service (ADR modular-3d-assets). An `asset3d` is an
// aggregate that CITES generations by id — it owns NO media, exactly like a
// CinemaStudio film/shot. A part's extraction image and mesh are ORDINARY
// generations (charged, polled, settled, refunded by the untouched lifecycle);
// the row holds only their nullable foreign keys.
//
// FIVE disciplines carried over from the rest of the codebase:
//  1. OWNERSHIP IS THE TYPE SIGNATURE. Every method takes `userId` first and
//     scopes every query by it (via requireAsset / requirePart). The SAME 404 is
//     used for "missing" and "not yours" so an attacker cannot probe id existence.
//  2. NO LEDGER. extract/mesh ride `generations.create()` — the single money
//     path. This file imports no ledger, writes no charge/refund/settle code. If
//     you ever import `chargeCredits`/`refundCredits` here, the design has gone
//     wrong. The orchestrator NEVER refunds; a failed extraction is refunded
//     INSIDE create() and simply propagates, leaving the part draft/retryable.
//  3. PART STATUS IS DERIVED, NEVER STORED. There is no status column; the DTO
//     computes `draft|extracting|extracted|meshing|ready` from the cited
//     generations' LIVE statuses at read time (derivePartStatus) and serializes
//     it on the part — recomputed per read, a single source of truth.
//  4. CITATION, NOT OWNERSHIP. Deleting an asset removes rows only; the cited
//     generations stay in the library (bare-text FKs, no cascade). Only the owner
//     edges (userId, assetId) cascade.
//  5. THE SERVER MODEL RULE. The extraction model and the prompt are chosen
//     server-side (pickExtractionModel + composeExtractPrompt); the client never
//     sends a prompt or an extraction model id.
//
// Dependency surface (narrow + declared): `db`, `storage`, `generations` narrowed
// to `Pick<GenerationService,'create'|'get'>` (create for extract/mesh, get for
// deriving a cited generation's status — NEVER the ledger), and the shared
// read-only `CATALOG` registry (only to pick the reference-capable extraction model).
import { randomUUID } from 'node:crypto'
import { and, asc, count, desc, eq, isNotNull, isNull, or } from 'drizzle-orm'
import { MAX_PARTS } from '@opencreate/contracts'
import type {
  Asset3d,
  Asset3dDetail,
  Asset3dPart,
  CreateAsset3dInput,
  CreateAsset3dPartInput,
  MeshPartInput,
  PartStatus,
  PartTransform,
  UpdateAsset3dInput,
  UpdateAsset3dPartInput,
} from '@opencreate/contracts'
import type { Db } from '../../db/client'
import type { StorageProvider } from '../../storage/local'
import { asset3d, asset3dPart } from '../../db/schema'
import { CATALOG } from '../catalog/catalog'
import type { GenerationService } from '../generations/service'

// Reuse the generation service's domain-error shapes so app.ts's central handler
// maps them to the ApiError envelope with no per-route mapping.
export class Asset3dNotFoundError extends Error {
  statusCode = 404
  apiCode = 'not_found'
  constructor() {
    super('asset not found')
  }
}
export class Asset3dValidationError extends Error {
  statusCode = 400
  apiCode = 'validation_failed'
}

// Order-spacing for parts: a new part appends at (max + STEP); analyze lays down
// (i+1)·STEP. REAL column, so a future midpoint insert needs no whole-list renumber.
const ORDER_STEP = 1000

// The generation service, narrowed to the ONLY two methods this orchestrator may
// call. Stating that in the type is the cheapest guard against this file growing a
// second money path (a poll here, a refund there), and lets tests hand over a fake.
type Asset3dGenerations = Pick<GenerationService, 'create' | 'get'>

// A part row as it comes back from drizzle.
type PartRow = typeof asset3dPart.$inferSelect

// ── Derived status (never stored) ────────────────────────────────────────────
// Computed from the cited generations' LIVE statuses at read time. `get` doubles
// as the poll, so reading a part's status drives any in-flight mesh forward. A
// generation the citation points at but that can no longer be read (deleted from
// the library) is treated as not-yet-terminal for that stage, never as ready.
// A FAILED mesh derives back to 'extracted' (retryable, ADR D4) — see the mesh
// branch — so a terminal, already-refunded mesh never leaves the part stuck on a
// 'meshing' spinner.
async function derivePartStatus(
  gen: Pick<Asset3dGenerations, 'get'>,
  userId: string,
  row: { imageGenerationId: string | null; meshGenerationId: string | null },
): Promise<PartStatus> {
  if (!row.imageGenerationId) return 'draft'
  const img = await gen.get(userId, row.imageGenerationId).catch(() => null)
  if (!img || img.status !== 'succeeded') return 'extracting'
  if (!row.meshGenerationId) return 'extracted'
  const mesh = await gen.get(userId, row.meshGenerationId).catch(() => null)
  if (mesh?.status === 'succeeded') return 'ready'
  // A FAILED mesh falls back to 'extracted' so the part is RETRYABLE (ADR D4:
  // "meshing → extracted on mesh failure"). The mesh generation is terminal and
  // already refunded inside the money path, so leaving the part on 'meshing' would
  // be a permanent spinner over a dead job. A still-processing mesh — or a
  // momentarily unreadable citation — stays 'meshing'.
  if (mesh?.status === 'failed') return 'extracted'
  return 'meshing'
}

// Server-fixed extraction prompt (the template-catalog rule: prompts never leave
// the server). The concept image rides as the model's reference; the prompt names
// only the part to isolate.
function composeExtractPrompt(name: string, description: string): string {
  const desc = description.trim() ? ` (${description.trim()})` : ''
  return `only the ${name}${desc}, isolated on a neutral studio background, occluded regions completed, orthographic product shot`
}

// The reference-capable IMAGE model — selected by the `referenceMode` discriminator,
// NOT hardcoded (the two qualifying models today are flux-kontext-pro and
// nano-banana-pro; which extracts best is an ADR open question decided by a real
// sheet, so default to the first). A missing one is a boot/catalog bug, not a
// user error, so it throws a plain Error → 500.
function pickExtractionModel(): string {
  const model = CATALOG.find((m) => m.type === 'image' && m.referenceMode)
  if (!model) throw new Error('no reference-capable image model in the catalog')
  return model.id
}

export type Asset3dService = ReturnType<typeof createAsset3dService>

export function createAsset3dService({
  db,
  storage,
  generations,
}: {
  db: Db
  storage: StorageProvider
  generations: Asset3dGenerations
}) {
  // ── DTO mappers ───────────────────────────────────────────────────────────
  function toAssetDto(row: typeof asset3d.$inferSelect): Asset3d {
    return {
      id: row.id,
      title: row.title,
      // conceptImagePath is the FULL '/media/<uuid>.<ext>' path saveDataUri
      // returned — passed through verbatim (guaranteed to start '/media/').
      conceptImageUrl: row.conceptImagePath,
      createdAt: new Date(row.createdAt).toISOString(),
    }
  }
  // ── Ownership gates (same 404 for missing-or-foreign) ─────────────────────
  function requireAsset(userId: string, assetId: string) {
    const row = db
      .select()
      .from(asset3d)
      .where(and(eq(asset3d.id, assetId), eq(asset3d.userId, userId)))
      .get()
    if (!row) throw new Asset3dNotFoundError()
    return row
  }
  function requirePart(userId: string, assetId: string, partId: string): PartRow {
    requireAsset(userId, assetId)
    const row = db
      .select()
      .from(asset3dPart)
      .where(and(eq(asset3dPart.id, partId), eq(asset3dPart.assetId, assetId)))
      .get()
    if (!row) throw new Asset3dNotFoundError()
    return row
  }

  // A user-scoped part DTO: derivePartStatus needs the real userId (get() is
  // user-scoped), so build the DTO here where userId is in hand.
  async function partDto(userId: string, row: PartRow): Promise<Asset3dPart> {
    return {
      id: row.id,
      assetId: row.assetId,
      name: row.name,
      description: row.description,
      sortOrder: row.sortOrder,
      imageGenerationId: row.imageGenerationId,
      meshGenerationId: row.meshGenerationId,
      transform: row.transformJson ? (JSON.parse(row.transformJson) as PartTransform) : null,
      status: await derivePartStatus(generations, userId, row),
      createdAt: new Date(row.createdAt).toISOString(),
    }
  }

  // ── Assets ─────────────────────────────────────────────────────────────────
  async function createAsset(userId: string, input: CreateAsset3dInput): Promise<Asset3d> {
    const id = randomUUID()
    // saveDataUri RETURNS the full '/media/<uuid>.<ext>' public path — persist it
    // verbatim (no '/media/' + key reconstruction anywhere). A fresh media key so
    // the stored image is independent of the asset row id.
    const conceptImagePath = await storage.saveDataUri(input.conceptImage, randomUUID())
    const now = new Date()
    db.insert(asset3d).values({ id, userId, title: input.title.trim(), conceptImagePath, createdAt: now }).run()
    return toAssetDto(db.select().from(asset3d).where(eq(asset3d.id, id)).get()!)
  }

  function listAssets(userId: string): Asset3d[] {
    return db
      .select()
      .from(asset3d)
      .where(eq(asset3d.userId, userId))
      .orderBy(desc(asset3d.createdAt))
      .all()
      .map(toAssetDto)
  }

  async function getAsset(userId: string, assetId: string): Promise<Asset3dDetail> {
    const row = requireAsset(userId, assetId)
    const parts = db
      .select()
      .from(asset3dPart)
      .where(eq(asset3dPart.assetId, assetId))
      .orderBy(asc(asset3dPart.sortOrder))
      .all()
    return { asset: toAssetDto(row), parts: await Promise.all(parts.map((p) => partDto(userId, p))) }
  }

  function updateAsset(userId: string, assetId: string, input: UpdateAsset3dInput): Asset3d {
    requireAsset(userId, assetId)
    if (input.title !== undefined)
      db.update(asset3d).set({ title: input.title.trim() }).where(eq(asset3d.id, assetId)).run()
    return toAssetDto(db.select().from(asset3d).where(eq(asset3d.id, assetId)).get()!)
  }

  function deleteAsset(userId: string, assetId: string): void {
    requireAsset(userId, assetId)
    // Cascade (schema FK) removes parts. The cited generations are NEVER touched —
    // they stay in the library (bare-text citation FKs, no cascade).
    db.delete(asset3d).where(eq(asset3d.id, assetId)).run()
  }

  // ── Parts ────────────────────────────────────────────────────────────────
  function nextSortOrder(assetId: string): number {
    const rows = db
      .select({ sortOrder: asset3dPart.sortOrder })
      .from(asset3dPart)
      .where(eq(asset3dPart.assetId, assetId))
      .orderBy(desc(asset3dPart.sortOrder))
      .limit(1)
      .all()
    return (rows[0]?.sortOrder ?? 0) + ORDER_STEP
  }

  // Total parts on an asset. The MAX_PARTS cap reads it: without a total-count gate
  // the manual POST …/parts appended without limit (Bug 2) — a multi-GLB assembly
  // stresses VRAM, so the ADR bounds every asset at MAX_PARTS.
  function countParts(assetId: string): number {
    return db.select({ v: count() }).from(asset3dPart).where(eq(asset3dPart.assetId, assetId)).get()?.v ?? 0
  }

  // Parts that SURVIVE a draft purge (>=1 citation = paid extraction/mesh).
  // replaceDraftParts sizes its analyzed insert against the room these leave under
  // the cap, so re-analyze can never stack drafts on top of paid work past MAX_PARTS.
  function countNonDraftParts(assetId: string): number {
    return (
      db
        .select({ v: count() })
        .from(asset3dPart)
        .where(
          and(
            eq(asset3dPart.assetId, assetId),
            or(isNotNull(asset3dPart.imageGenerationId), isNotNull(asset3dPart.meshGenerationId)),
          ),
        )
        .get()?.v ?? 0
    )
  }

  async function addPart(userId: string, assetId: string, input: CreateAsset3dPartInput): Promise<Asset3dPart> {
    requireAsset(userId, assetId)
    // Enforce the whole-asset MAX_PARTS cap on the manual add path. The analyze
    // array is capped in the contract, but addPart had no total-count gate, so a
    // client could append past the bound part-by-part (Bug 2). >= because at
    // MAX_PARTS the asset is already full.
    if (countParts(assetId) >= MAX_PARTS)
      throw new Asset3dValidationError(`an asset can have at most ${MAX_PARTS} parts`)
    const id = randomUUID()
    db.insert(asset3dPart)
      .values({
        id,
        assetId,
        name: input.name.trim(),
        description: input.description?.trim() ?? '',
        sortOrder: nextSortOrder(assetId),
        createdAt: new Date(),
      })
      .run()
    return partDto(userId, db.select().from(asset3dPart).where(eq(asset3dPart.id, id)).get()!)
  }

  async function updatePart(
    userId: string,
    assetId: string,
    partId: string,
    input: UpdateAsset3dPartInput,
  ): Promise<Asset3dPart> {
    requirePart(userId, assetId, partId)
    const patch: Partial<typeof asset3dPart.$inferInsert> = {}
    if (input.name !== undefined) patch.name = input.name.trim()
    if (input.description !== undefined) patch.description = input.description.trim()
    // transform: null CLEARS (transformJson → null); absent = untouched. The
    // `!== undefined` guard is what distinguishes the two.
    if (input.transform !== undefined)
      patch.transformJson = input.transform === null ? null : JSON.stringify(input.transform)
    if (Object.keys(patch).length > 0)
      db.update(asset3dPart).set(patch).where(eq(asset3dPart.id, partId)).run()
    return partDto(userId, db.select().from(asset3dPart).where(eq(asset3dPart.id, partId)).get()!)
  }

  function deletePart(userId: string, assetId: string, partId: string): void {
    requirePart(userId, assetId, partId)
    db.delete(asset3dPart).where(eq(asset3dPart.id, partId)).run()
  }

  // ── Analyze seam (consumed by analyze.ts) ─────────────────────────────────
  // Ownership-checked; returns the concept image as a data URI (the seam
  // analyze.ts depends on). The stored full path is passed to readAsDataUri verbatim.
  async function requireAssetConcept(userId: string, assetId: string): Promise<string> {
    const row = requireAsset(userId, assetId)
    return storage.readAsDataUri(row.conceptImagePath)
  }
  // Replace the asset's DRAFT parts (both citations null) with the analyzed set,
  // atomically. Parts already extracted/meshed are PRESERVED — only drafts are
  // swapped, so re-running analyze never destroys paid work.
  async function replaceDraftParts(
    userId: string,
    assetId: string,
    parts: { name: string; description: string }[],
  ): Promise<Asset3dPart[]> {
    requireAsset(userId, assetId)
    const now = new Date()
    // The MAX_PARTS cap is over the WHOLE asset. Only drafts (both citations null)
    // are swapped; paid parts survive — so the analyzed set may fill only the room
    // the survivors leave. Without this bound, re-analyze inserted up to MAX_PARTS
    // drafts ON TOP OF existing paid parts and blew the cap (Bug 2). Survivors carry
    // >=1 citation, so the draft delete below never changes this count — safe to read
    // it before the transaction.
    const room = Math.max(0, MAX_PARTS - countNonDraftParts(assetId))
    const toInsert = parts.slice(0, room)
    db.transaction((tx) => {
      tx.delete(asset3dPart)
        .where(
          and(
            eq(asset3dPart.assetId, assetId),
            isNull(asset3dPart.imageGenerationId),
            isNull(asset3dPart.meshGenerationId),
          ),
        )
        .run()
      const base = nextSortOrder(assetId)
      toInsert.forEach((p, i) => {
        tx.insert(asset3dPart)
          .values({
            id: randomUUID(),
            assetId,
            name: p.name.trim(),
            description: p.description.trim(),
            sortOrder: base + i * ORDER_STEP,
            createdAt: now,
          })
          .run()
      })
    })
    const rows = db
      .select()
      .from(asset3dPart)
      .where(eq(asset3dPart.assetId, assetId))
      .orderBy(asc(asset3dPart.sortOrder))
      .all()
    return Promise.all(rows.map((r) => partDto(userId, r)))
  }

  // ── Extract (paid image generation) ───────────────────────────────────────
  // ADR D2: one part → one standard image generation through the money path, with
  // the concept image as the model's reference (the server-only referenceImages
  // channel) and a server-composed prompt. Image gens settle SYNCHRONOUSLY, so the
  // returned dto is already terminal. A failed extraction is refunded INSIDE
  // create() and the thrown error propagates — the part stays draft/retryable, and
  // this orchestrator never refunds.
  async function extract(userId: string, assetId: string, partId: string): Promise<Asset3dPart> {
    const asset = requireAsset(userId, assetId)
    const part = requirePart(userId, assetId, partId)
    const modelId = pickExtractionModel()
    const conceptDataUri = await storage.readAsDataUri(asset.conceptImagePath)
    const { dto } = await generations.create(userId, {
      modelId,
      prompt: composeExtractPrompt(part.name, part.description),
      aspectRatio: '1:1',
      referenceImages: [conceptDataUri],
    })
    // Cite the new extraction (the old generation stays in the library). Also NULL
    // the mesh citation in the SAME write: a mesh built from the PREVIOUS extraction
    // image is now stale, so the part must derive back to 'extracted' and be
    // re-meshed against THIS image. Without the null, re-extracting a meshed part
    // left the old meshGenerationId in place and the part still read 'ready' — a
    // mesh of the previous picture presented as current (Bug 1). Only written AFTER
    // a successful, charged generation.
    db.update(asset3dPart)
      .set({ imageGenerationId: dto.id, meshGenerationId: null })
      .where(eq(asset3dPart.id, partId))
      .run()
    return partDto(userId, db.select().from(asset3dPart).where(eq(asset3dPart.id, partId)).get()!)
  }

  // ── Mesh (paid model3d generation) ────────────────────────────────────────
  // ADR D3: the extracted image → a model3d generation (image→3D). Validates the
  // cited image gen three ways (owned, type image, succeeded) — a still-processing
  // or foreign citation must never be meshed. model3d is ASYNC (created:false), so
  // the part derives to 'meshing' until a GET /api/generations/:id polls it to ready.
  async function mesh(
    userId: string,
    assetId: string,
    partId: string,
    input: MeshPartInput,
  ): Promise<Asset3dPart> {
    requireAsset(userId, assetId)
    const part = requirePart(userId, assetId, partId)
    if (!part.imageGenerationId) throw new Asset3dValidationError('extract the part before meshing it')
    const img = await generations.get(userId, part.imageGenerationId)
    if (img.type !== 'image' || img.status !== 'succeeded')
      throw new Asset3dValidationError('the part extraction is not ready yet')
    // In-flight guard against an avoidable double-spend (Bug 3): a duplicate click
    // while a mesh is still PROCESSING would create a SECOND charged model3d
    // generation and orphan the paid one. Reject here — BEFORE create() — so no
    // credits are charged and the provider is never called. `generations.get`
    // doubles as the poll, so a mesh that has just finished is observed terminal and
    // the re-roll below proceeds. Re-meshing a SUCCEEDED or FAILED mesh is an
    // INTENTIONAL re-roll (ADR D3 — the old generation stays in the library, the
    // citation is replaced), so ONLY the still-processing case is blocked. A citation
    // that can no longer be read (deleted) is not processing → the re-roll is allowed.
    if (part.meshGenerationId) {
      const existingMesh = await generations.get(userId, part.meshGenerationId).catch(() => null)
      if (existingMesh && existingMesh.status === 'processing')
        throw new Asset3dValidationError('a mesh is already being generated for this part')
    }
    // A succeeded image gen always has its stored asset; the guard keeps the type
    // honest under noUncheckedIndexedAccess and turns an impossible empty-media row
    // into a clean 400 rather than passing `undefined` to readAsDataUri.
    const mediaUrl = img.mediaUrls[0]
    if (!mediaUrl) throw new Asset3dValidationError('the part extraction has no image')
    const partImage = await storage.readAsDataUri(mediaUrl)
    const { dto } = await generations.create(userId, {
      modelId: input.modelId, // client picks the tier; create() prices it via catalog
      prompt: `3D mesh of ${part.name}`, // model3d ignores prompt beyond provenance
      inputImage: partImage,
    })
    db.update(asset3dPart).set({ meshGenerationId: dto.id }).where(eq(asset3dPart.id, partId)).run()
    return partDto(userId, db.select().from(asset3dPart).where(eq(asset3dPart.id, partId)).get()!)
  }

  return {
    createAsset,
    listAssets,
    getAsset,
    updateAsset,
    deleteAsset,
    addPart,
    updatePart,
    deletePart,
    extract,
    mesh,
    // The narrow seam analyze.ts consumes.
    requireAssetConcept,
    replaceDraftParts,
  }
}
