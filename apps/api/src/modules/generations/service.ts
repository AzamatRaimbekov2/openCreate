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

// How long a row may stay 'processing' before it counts as abandoned. There
// are no background workers in the MVP — settlement is driven entirely by the
// SPA's polls — so a row nobody can settle (expired 7-day Runware asset URL,
// persistent download failure, crash between insert and submit) would hold
// the user's credits forever. Runware video jobs finish in minutes; one hour
// is far beyond any legitimate in-flight generation.
export const STALE_PROCESSING_MS = 60 * 60 * 1000

// Guarded terminal transition shared by every failure path: only a row that
// is STILL processing is flipped (concurrent pollers/creators race each
// other), and refundCredits is idempotent (once-per-generation guard in the
// ledger) — so no combination of callers can double-refund or resurrect a row.
function failGeneration(db: Db, userId: string, id: string, errorMessage: string) {
  db.transaction((tx) => {
    const fresh = tx.select().from(generation).where(eq(generation.id, id)).get()
    if (fresh?.status !== 'processing') return
    tx.update(generation)
      .set({ status: 'failed', errorMessage, completedAt: new Date() })
      .where(eq(generation.id, id))
      .run()
  })
  refundCredits(db, userId, id)
}

// Boot-time sweep (wired in app.ts): settles processing rows older than the
// staleness threshold even if their owner never polls again — the spec's
// hold→settle/refund guarantee must not depend on the SPA staying open.
export function settleStaleGenerations(db: Db, now = Date.now()): number {
  const cutoff = new Date(now - STALE_PROCESSING_MS)
  const rows = db
    .select()
    .from(generation)
    .where(and(eq(generation.status, 'processing'), lt(generation.createdAt, cutoff)))
    .all()
  for (const row of rows) failGeneration(db, row.userId, row.id, 'generation timed out')
  return rows.length
}

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
    // runwareTaskUuid is deliberately NOT set yet: the row must not be
    // pollable before Runware knows the task. A concurrent GET /:id during the
    // in-flight provider call would otherwise ask Runware about an unknown
    // task, get an error, mark the row failed AND refund — while the provider
    // call still succeeds (free-generation double-spend).
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
        // Status-guarded settle: ONLY a processing row may become succeeded.
        // Without the guard a row that some other path already failed+refunded
        // (e.g. the stale-generation reaper) would be flipped back to
        // succeeded and deliver the asset for free — the ledger would show
        // charge + refund = 0 while the user keeps the image.
        let settled = false
        db.transaction((tx) => {
          const fresh = tx.select().from(generation).where(eq(generation.id, id)).get()
          if (fresh?.status !== 'processing') return
          tx.update(generation)
            .set({
              status: 'succeeded',
              mediaJson: JSON.stringify([mediaUrl]),
              runwareCostUsd: res.cost?.toString(),
              completedAt: new Date(),
              paramsJson: JSON.stringify({ aspectRatio: input.aspectRatio, seed: res.seed }),
            })
            .where(eq(generation.id, id))
            .run()
          settled = true
        })
        // Row already settled elsewhere (failed + refunded) → the user was
        // made whole; discard the downloaded asset instead of delivering it.
        if (!settled) await storage.remove(id, 'webp')
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
      // Publish the task uuid ONLY now that Runware has acknowledged the task.
      // Before this point get() refuses to poll (null uuid → no provider call),
      // which closes the submit-window race: a concurrent poll can no longer
      // ask Runware about a not-yet-registered task, read the resulting error
      // as a failure, and refund a job the operator still pays Runware for.
      // Status-guarded so a row settled elsewhere is never resurrected.
      db.update(generation)
        .set({ runwareTaskUuid: taskUUID })
        .where(and(eq(generation.id, id), eq(generation.status, 'processing')))
        .run()
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
    if (row.status !== 'processing') return toDto(row)
    // Reaper: an hour-old processing row is abandoned (see STALE_PROCESSING_MS)
    // — settle it as failed + refund instead of holding the charge forever.
    if (Date.now() - row.createdAt.getTime() > STALE_PROCESSING_MS) {
      failGeneration(db, userId, id, 'generation timed out')
      const settled = db.select().from(generation).where(eq(generation.id, id)).get()
      return toDto(settled!)
    }
    // A null runwareTaskUuid on a processing row means create() has not yet
    // finished the provider submit — the task does not exist on Runware's side
    // yet, so polling it would misread "unknown task" as a terminal failure
    // (and refund a job that is about to succeed). Return the row as-is; the
    // SPA's next poll will find the uuid once the submit completes.
    if (!row.runwareTaskUuid) return toDto(row)

    const poll = await runware.getResponse(row.runwareTaskUuid)
    if (poll.status === 'processing') {
      db.update(generation).set({ progress: poll.progress }).where(eq(generation.id, id)).run()
      return toDto({ ...row, progress: poll.progress })
    }
    if (poll.status === 'success') {
      const src = poll.videoURL ?? poll.imageURL
      if (!src) {
        // 'success' with no asset URL is unrecoverable: every future poll of
        // this task would return the same payload, so "leave it processing
        // and retry" loops forever while the user's credits stay held. Treat
        // it as a provider failure and give the money back.
        failGeneration(db, userId, id, 'provider returned no asset')
        const settled = db.select().from(generation).where(eq(generation.id, id)).get()
        return toDto(settled!)
      }
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
      // Guarded fail + idempotent refund — concurrent polls cannot double-settle.
      failGeneration(db, userId, id, poll.message)
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
