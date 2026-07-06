// Generation lifecycle service (plan Task 10) — the core of the product.
// One place owns the whole money-touching sequence: charge credits at submit
// (the ADR's hold→settle collapsed), call Runware, persist state transitions,
// download finished assets into our storage (Runware URLs expire in 7 days),
// and refund exactly once on failure. Injected deps (db/runware/storage) keep
// it fully testable with the scripted fake in test/helpers/build-test-app.ts.
import { randomUUID } from 'node:crypto'
import { and, desc, eq, lt } from 'drizzle-orm'
import type { CreateGenerationInput, Generation } from '@opencreate/contracts'
import type { Db } from '../../db/client'
import type { RunwareClient } from '../../integrations/runware/client'
import type { StorageProvider } from '../../storage/local'
import { generation } from '../../db/schema'
import { chargeCredits, refundCredits } from '../credits/ledger'
import { creditsFor, getModel, resolutionFor } from '../catalog/catalog'

// Domain errors carry statusCode + apiCode so the central error handler in
// app.ts maps them straight to the ApiError envelope — no per-route mapping.
export class NotFoundError extends Error {
  statusCode = 404
  apiCode = 'not_found'
}
export class ValidationError extends Error {
  statusCode = 400
  apiCode = 'validation_failed'
}

type Deps = { db: Db; runware: RunwareClient; storage: StorageProvider }

// DB row → wire DTO (contracts generationSchema). JSON columns are parsed here
// and dates leave as ISO strings — the wire contract is JSON, not Date objects.
function toDto(row: typeof generation.$inferSelect): Generation {
  return {
    id: row.id,
    type: row.type,
    mode: row.mode,
    status: row.status,
    prompt: row.prompt,
    modelId: row.modelId,
    params: JSON.parse(row.paramsJson) as Generation['params'],
    costCredits: row.costCredits,
    mediaUrls: JSON.parse(row.mediaJson) as string[],
    progress: row.progress,
    errorMessage: row.errorMessage,
    createdAt: new Date(row.createdAt).toISOString(),
    completedAt: row.completedAt ? new Date(row.completedAt).toISOString() : null,
  }
}

export type GenerationService = ReturnType<typeof createGenerationService>

export function createGenerationService({ db, runware, storage }: Deps) {
  // `created: true` → the asset is final (image, sync) → route answers 201.
  // `created: false` → accepted for async processing (video) → route answers 202.
  async function create(
    userId: string,
    input: CreateGenerationInput,
  ): Promise<{ dto: Generation; created: boolean }> {
    // Catalog-level validation BEFORE charging: zod already validated the
    // shape, but only the catalog knows which combinations are real.
    const model = getModel(input.modelId)
    if (!model) throw new ValidationError(`unknown model ${input.modelId}`)
    if (!model.aspectRatios.includes(input.aspectRatio))
      throw new ValidationError(`aspect ${input.aspectRatio} unsupported for ${model.id}`)
    if (input.inputImage && !model.supportsImageInput)
      throw new ValidationError(`${model.id} does not support image input`)
    let cost: number
    try {
      cost = creditsFor(model, input.duration)
    } catch (err) {
      // creditsFor throws plain Errors (missing/unsupported duration) — those
      // are caller mistakes, so surface as 400, not 500.
      throw new ValidationError(err instanceof Error ? err.message : 'invalid duration')
    }
    const { width, height } = resolutionFor(model, input.aspectRatio)
    const id = randomUUID()
    const taskUUID = randomUUID()
    const now = new Date()
    const mode = input.inputImage ? 'image' : 'text'

    // Charge first (throws 402 before any provider call), then persist the
    // processing row — from here on every failure path must refund.
    chargeCredits(db, userId, cost, id)
    db.insert(generation)
      .values({
        id,
        userId,
        type: model.type,
        mode,
        status: 'processing',
        prompt: input.prompt,
        modelId: model.id,
        paramsJson: JSON.stringify({ aspectRatio: input.aspectRatio, duration: input.duration }),
        costCredits: cost,
        runwareTaskUuid: taskUUID,
        createdAt: now,
      })
      .run()

    if (model.type === 'image') {
      // Images are synchronous: one provider call resolves to a URL we
      // immediately copy into our own storage.
      try {
        const res = await runware.imageInference({
          taskUUID,
          positivePrompt: input.prompt,
          model: model.air,
          width,
          height,
        })
        const mediaUrl = await storage.saveFromUrl(res.imageURL, id, 'webp')
        db.update(generation)
          .set({
            status: 'succeeded',
            mediaJson: JSON.stringify([mediaUrl]),
            runwareCostUsd: res.cost?.toString(),
            completedAt: new Date(),
            paramsJson: JSON.stringify({ aspectRatio: input.aspectRatio, seed: res.seed }),
          })
          .where(eq(generation.id, id))
          .run()
      } catch (err) {
        // Provider or download failure → mark failed, give the money back,
        // and rethrow so the route surfaces the provider error envelope.
        refundCredits(db, userId, id)
        db.update(generation)
          .set({
            status: 'failed',
            errorMessage: err instanceof Error ? err.message : 'generation failed',
            completedAt: new Date(),
          })
          .where(eq(generation.id, id))
          .run()
        throw err
      }
      const row = db.select().from(generation).where(eq(generation.id, id)).get()
      return { dto: toDto(row!), created: true }
    }

    // Video is async: submit and return 202; progress arrives via get() polls.
    try {
      await runware.submitVideo({
        taskUUID,
        positivePrompt: input.prompt,
        model: model.air,
        width,
        height,
        duration: input.duration!,
        ...(input.inputImage
          ? { frameImages: [{ image: input.inputImage, frame: 'first' as const }] }
          : {}),
      })
    } catch (err) {
      refundCredits(db, userId, id)
      db.update(generation)
        .set({
          status: 'failed',
          errorMessage: err instanceof Error ? err.message : 'submit failed',
          completedAt: new Date(),
        })
        .where(eq(generation.id, id))
        .run()
      throw err
    }
    const row = db.select().from(generation).where(eq(generation.id, id)).get()
    return { dto: toDto(row!), created: false }
  }

  // get() doubles as the poll: while a row is processing, each read asks
  // Runware getResponse and applies the transition — no background workers in
  // the MVP, the SPA's 4s polling drives progress.
  async function get(userId: string, id: string): Promise<Generation> {
    const row = db
      .select()
      .from(generation)
      .where(and(eq(generation.id, id), eq(generation.userId, userId)))
      .get()
    if (!row) throw new NotFoundError('generation not found')
    if (row.status !== 'processing' || !row.runwareTaskUuid) return toDto(row)

    const poll = await runware.getResponse(row.runwareTaskUuid)
    if (poll.status === 'processing') {
      db.update(generation).set({ progress: poll.progress }).where(eq(generation.id, id)).run()
      return toDto({ ...row, progress: poll.progress })
    }
    if (poll.status === 'success') {
      const src = poll.videoURL ?? poll.imageURL
      if (!src) return toDto(row)
      // Download BEFORE the status flip: if the download throws, the row stays
      // processing and the next poll retries — never a succeeded row without media.
      const mediaUrl = await storage.saveFromUrl(src, id, row.type === 'video' ? 'mp4' : 'webp')
      // Guard: only transition if still processing (two browser tabs can poll
      // the same generation concurrently).
      db.transaction((tx) => {
        const fresh = tx.select().from(generation).where(eq(generation.id, id)).get()
        if (fresh?.status !== 'processing') return
        tx.update(generation)
          .set({
            status: 'succeeded',
            mediaJson: JSON.stringify([mediaUrl]),
            runwareCostUsd: poll.cost?.toString(),
            progress: 100,
            completedAt: new Date(),
          })
          .where(eq(generation.id, id))
          .run()
      })
    } else {
      db.transaction((tx) => {
        const fresh = tx.select().from(generation).where(eq(generation.id, id)).get()
        if (fresh?.status !== 'processing') return
        tx.update(generation)
          .set({ status: 'failed', errorMessage: poll.message, completedAt: new Date() })
          .where(eq(generation.id, id))
          .run()
      })
      // refundCredits is idempotent (once-per-generation guard lives in the
      // ledger), so a concurrent poll racing this one cannot double-refund.
      refundCredits(db, userId, id)
    }
    const updated = db.select().from(generation).where(eq(generation.id, id)).get()
    return toDto(updated!)
  }

  // Cursor = createdAt epoch-ms of the last returned row; fetch limit+1 to
  // learn whether another page exists without a COUNT query.
  function list(userId: string, limit: number, cursor?: string) {
    const rows = db
      .select()
      .from(generation)
      .where(
        cursor
          ? and(eq(generation.userId, userId), lt(generation.createdAt, new Date(Number(cursor))))
          : eq(generation.userId, userId),
      )
      .orderBy(desc(generation.createdAt))
      .limit(limit + 1)
      .all()
    const items = rows.slice(0, limit).map(toDto)
    const nextCursor = rows.length > limit ? String(rows[limit - 1]!.createdAt.getTime()) : null
    return { items, nextCursor }
  }

  async function remove(userId: string, id: string) {
    const row = db
      .select()
      .from(generation)
      .where(and(eq(generation.id, id), eq(generation.userId, userId)))
      .get()
    if (!row) throw new NotFoundError('generation not found')
    // Remove the media file first (idempotent), then the row — a re-run after
    // a crash between the two steps is harmless.
    await storage.remove(id, row.type === 'video' ? 'mp4' : 'webp')
    db.delete(generation).where(eq(generation.id, id)).run()
  }

  return { create, get, list, remove }
}
