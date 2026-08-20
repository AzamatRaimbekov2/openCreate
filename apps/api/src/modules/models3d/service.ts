// Studio3D renders + shares (ADR: photo-to-3d-studio §D3, §D7).
//
// NOTHING HERE TOUCHES THE CREDIT LEDGER. A render spends our compute, not a
// provider invoice — the same bargain film_render struck. If you find yourself
// importing chargeCredits into this file, stop: you are about to bill a user twice
// for one model. The absence of a cost column on model_render is the structural
// guard; this comment is the human one.
//
// createRender() is SYNCHRONOUS today because the browser already did the render
// (the renderer fork resolved to the client-side WebCodecs path — the client POSTs
// a finished mp4 and we only normalize it). The row still carries a full status
// machine anyway, because that is exactly what a future SERVER engine — which will
// be async — needs, and it costs nothing to have now. That is also why the boot
// reaper below exists even though nothing can currently outlive a request.
import { randomUUID } from 'node:crypto'
import { unlink, writeFile } from 'node:fs/promises'
import { and, desc, eq } from 'drizzle-orm'
import { getScenePreset } from '@opencreate/contracts'
import type { CreateModelRenderInput, ModelRender, ModelShare } from '@opencreate/contracts'
import type { Db } from '../../db/client'
import { generation, modelRender, modelShare } from '../../db/schema'
import type { StorageProvider } from '../../storage/local'
import { parseVideoDataUri } from '../../storage/dataUri'
import { buildNormalizeArgs } from './normalize'
import { createSemaphore, runFfmpeg } from '../films/render'
import type { RenderRunResult } from '../films/render'
import { NotFoundError, ValidationError } from '../generations/service'

// ffmpeg is CPU-bound and this process also serves the API and holds the SQLite
// file. Same ceiling films/service.ts uses, for the same reason.
const MAX_CONCURRENT_RENDERS = 2

// A 'processing' render older than this was killed by a restart mid-normalize.
// Mirrors the film_render reaper's threshold.
export const STALE_MODEL_RENDER_MS = 30 * 60 * 1000

// 40MB decoded, matching createModelRenderInputSchema's char cap (which is applied
// to the base64 string, i.e. ~4/3 of this). The route raises its own bodyLimit to
// let a payload this size through at all — see routes.ts.
const MAX_VIDEO_BYTES = 40 * 1024 * 1024

// The normalize runner, injectable exactly like films/service.ts's `runRender`:
// tests must be able to drive the failure branch (and to avoid spawning a real
// ffmpeg on bytes that are not a real mp4) without a binary on the box.
export type NormalizeRunner = (args: string[]) => Promise<RenderRunResult>

export type Models3dDeps = {
  db: Db
  storage: StorageProvider
  runNormalize?: NormalizeRunner
}

export type Models3dService = ReturnType<typeof createModels3dService>

export function createModels3dService({ db, storage, runNormalize }: Models3dDeps) {
  const semaphore = createSemaphore(MAX_CONCURRENT_RENDERS)
  // totalMs=1 and a no-op progress sink: the normalize argv carries no `-progress`
  // flag, so runFfmpeg never emits a percent. A turntable normalize is seconds, not
  // minutes — there is nothing worth reporting, and inventing a fake percentage
  // would be worse than showing none.
  const runner: NormalizeRunner = runNormalize ?? ((args) => runFfmpeg(args, 1, () => undefined))

  // The ONE ownership gate every authenticated route in this module goes through.
  // Scoping the query by userId (rather than fetching then comparing) is what makes
  // a stranger's id indistinguishable from a nonexistent one — a 403 here would
  // confirm the row exists and hand out an enumeration oracle over other users'
  // generations.
  function requireModel(userId: string, generationId: string) {
    const row = db
      .select()
      .from(generation)
      .where(and(eq(generation.id, generationId), eq(generation.userId, userId)))
      .get()
    if (!row) throw new NotFoundError('Model not found')
    // Owned, but the wrong kind of thing — so this IS a 400. There is no turntable
    // of a photo.
    if (row.type !== 'model3d') throw new ValidationError('Not a 3D model')
    if (row.status !== 'succeeded') throw new ValidationError('Model is not ready yet')
    return row
  }

  function toRenderDto(row: typeof modelRender.$inferSelect): ModelRender {
    const media = JSON.parse(row.mediaJson) as string[]
    return {
      id: row.id,
      generationId: row.generationId,
      presetId: row.presetId,
      status: row.status,
      progress: row.progress,
      engine: row.engine,
      mediaUrl: media[0] ?? null,
      posterUrl: row.posterUrl,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
    }
  }

  // Status-guarded settle, mirroring the generation/film settle: never resurrect a
  // row that something else already finished.
  function settleRender(
    renderId: string,
    status: 'succeeded' | 'failed',
    mediaUrl: string | null,
    posterUrl: string | null,
    errorMessage: string | null,
  ) {
    db.transaction((tx) => {
      const fresh = tx.select().from(modelRender).where(eq(modelRender.id, renderId)).get()
      if (fresh?.status !== 'processing') return
      tx.update(modelRender)
        .set({
          status,
          progress: status === 'succeeded' ? 100 : fresh.progress,
          mediaJson: JSON.stringify(mediaUrl ? [mediaUrl] : []),
          posterUrl,
          errorMessage,
          completedAt: new Date(),
        })
        .where(eq(modelRender.id, renderId))
        .run()
    })
  }

  async function createRender(
    userId: string,
    generationId: string,
    input: CreateModelRenderInput,
  ): Promise<ModelRender> {
    requireModel(userId, generationId)
    // The preset table is SERVER-owned: the client sends a token, never a lighting
    // rig. An unknown token is a client bug or an attack, never a new preset — so
    // this is a 400 and it happens before a single byte is written.
    if (!getScenePreset(input.presetId)) throw new ValidationError('Unknown scene preset')

    // Decode BEFORE inserting the row: a malformed payload should be a clean 400,
    // not a 'failed' render the user has to go look at.
    const video = parseVideoDataUri(input.video, MAX_VIDEO_BYTES)

    const id = randomUUID()
    const now = new Date()
    db.insert(modelRender)
      .values({
        id,
        userId,
        generationId,
        presetId: input.presetId,
        engine: 'browser',
        status: 'processing',
        progress: 0,
        mediaJson: '[]',
        createdAt: now,
      })
      .run()

    // The raw upload is a scratch file: ffmpeg reads it, and it never becomes a
    // served asset. It carries a distinct key so a half-written normalize can never
    // be mistaken for the finished mp4 at /media/<id>.mp4. Both are WRITE-side
    // scratchPath()s — the output only becomes a real stored asset via
    // publishLocalFile below, on success (ADR railway-deployment D2).
    const rawKey = `${id}-raw`
    const rawPath = storage.scratchPath(rawKey, 'mp4')
    const outputPath = storage.scratchPath(id, 'mp4')

    const release = await semaphore.acquire()
    try {
      await writeFile(rawPath, video.bytes)
      const result = await runner(buildNormalizeArgs({ inputPath: rawPath, outputPath }))
      if (!result.ok) {
        // A failed normalize may still have left a truncated mp4 behind. Serving a
        // partial file as a finished turntable is worse than serving nothing.
        // Nothing was published yet, so this is local-scratch cleanup only.
        await unlink(outputPath).catch(() => undefined)
        await storage.remove(id, 'mp4').catch(() => undefined)
        settleRender(id, 'failed', null, null, result.error)
      } else {
        // Output becomes a real asset here — a no-op rename on local disk,
        // upload-then-unlink on R2. Poster last, and only on success: it is the
        // crawler/no-WebGL fallback for an artifact that now exists. saveDataUri
        // re-validates it against the RASTER allowlist (no svg → no stored XSS),
        // so the schema at the wire is not the only thing standing between an
        // <script>-carrying "image" and our disk.
        const mediaUrl = await storage.publishLocalFile(outputPath, id, 'mp4')
        const posterUrl = await storage.saveDataUri(input.poster, `${id}-poster`)
        settleRender(id, 'succeeded', mediaUrl, posterUrl, null)
      }
    } catch (err) {
      await unlink(outputPath).catch(() => undefined)
      await storage.remove(id, 'mp4').catch(() => undefined)
      settleRender(id, 'failed', null, null, err instanceof Error ? err.message : 'render failed')
    } finally {
      // Always drop the scratch input, on every path.
      await unlink(rawPath).catch(() => undefined)
      release()
    }

    return toRenderDto(db.select().from(modelRender).where(eq(modelRender.id, id)).get()!)
  }

  function listRenders(userId: string, generationId: string): ModelRender[] {
    requireModel(userId, generationId)
    return db
      .select()
      .from(modelRender)
      .where(and(eq(modelRender.generationId, generationId), eq(modelRender.userId, userId)))
      .orderBy(desc(modelRender.createdAt))
      .all()
      .map(toRenderDto)
  }

  // Poll-shaped: pointless today (createRender settles before it returns) but it is
  // the endpoint a future server engine needs, and it costs one query.
  function getRender(userId: string, renderId: string): ModelRender {
    const row = db
      .select()
      .from(modelRender)
      .where(and(eq(modelRender.id, renderId), eq(modelRender.userId, userId)))
      .get()
    if (!row) throw new NotFoundError('Render not found')
    return toRenderDto(row)
  }

  async function deleteRender(userId: string, renderId: string): Promise<void> {
    const row = db
      .select()
      .from(modelRender)
      .where(and(eq(modelRender.id, renderId), eq(modelRender.userId, userId)))
      .get()
    if (!row) throw new NotFoundError('Render not found')
    db.delete(modelRender).where(eq(modelRender.id, renderId)).run()
    // A share pointing at a deleted render must not keep advertising it. Null the
    // link rather than revoking the share: the user deleted a video, not a model.
    db.update(modelShare)
      .set({ renderId: null })
      .where(eq(modelShare.renderId, renderId))
      .run()
    await storage.remove(renderId, 'mp4').catch(() => undefined)
  }

  // Idempotent by design. The unique index on generation_id makes a second row
  // impossible, so a second "Share" click MUST return the existing token — if it
  // minted a new one, revoke (a single DELETE) would kill only one of them and
  // leave the model quietly public.
  //
  // The renderId link IS refreshed on every call, so a user who shares, then
  // renders a turntable, then shares again gets a public page that shows the video —
  // without ever changing the URL they may already have sent to someone.
  function share(userId: string, generationId: string): { token: string } {
    requireModel(userId, generationId)
    const latestRender = db
      .select()
      .from(modelRender)
      .where(
        and(eq(modelRender.generationId, generationId), eq(modelRender.status, 'succeeded')),
      )
      .orderBy(desc(modelRender.createdAt))
      .get()
    const renderId = latestRender?.id ?? null

    const existing = db
      .select()
      .from(modelShare)
      .where(and(eq(modelShare.generationId, generationId), eq(modelShare.userId, userId)))
      .get()
    if (existing) {
      db.update(modelShare).set({ renderId }).where(eq(modelShare.id, existing.id)).run()
      return { token: existing.id }
    }

    const id = randomUUID()
    db.insert(modelShare)
      .values({ id, userId, generationId, renderId, createdAt: new Date() })
      .run()
    return { token: id }
  }

  function revokeShare(userId: string, generationId: string): void {
    requireModel(userId, generationId)
    db.delete(modelShare)
      .where(and(eq(modelShare.generationId, generationId), eq(modelShare.userId, userId)))
      .run()
  }

  // PUBLIC — no userId, no session. This is the ONLY unauthenticated read in the
  // module, so its return value is the entire attack surface: the model, its poster,
  // its turntable and its title. Deliberately NOT returned: the owner's user id, the
  // credit cost, the model tier, the provider job id, the created-at. A token grants
  // a look at an object, not at an account. models3d.test.ts pins the exact key set
  // so a field cannot be added here without someone making that decision on purpose.
  function resolveShare(token: string): ModelShare {
    const row = db.select().from(modelShare).where(eq(modelShare.id, token)).get()
    if (!row) throw new NotFoundError('Share not found')

    const model = db.select().from(generation).where(eq(generation.id, row.generationId)).get()
    // The generation was deleted from the gallery (model_share carries no FK, on
    // purpose). The token is a dangling pointer — 404, same as an unknown token.
    if (!model || model.status !== 'succeeded') throw new NotFoundError('Share not found')
    const glbUrl = (JSON.parse(model.mediaJson) as string[])[0]
    if (!glbUrl) throw new NotFoundError('Share not found')

    const render = row.renderId
      ? db.select().from(modelRender).where(eq(modelRender.id, row.renderId)).get()
      : undefined
    const videoUrl =
      render?.status === 'succeeded'
        ? ((JSON.parse(render.mediaJson) as string[])[0] ?? null)
        : null

    return {
      token: row.id,
      glbUrl,
      posterUrl: render?.posterUrl ?? null,
      videoUrl,
      title: model.prompt,
    }
  }

  return { createRender, listRenders, getRender, deleteRender, share, revokeShare, resolveShare }
}

// Boot-time reaper (wired in app.ts), mirroring settleStaleGenerations and the
// film_render reaper: a render whose process died mid-normalize would hold
// 'processing' forever with no poller to settle it, and spin in the UI. No refund —
// a render has no charge.
export function settleStaleModelRenders(
  db: Db,
  now = Date.now(),
  log?: { warn: (o: unknown, m: string) => void },
): number {
  const cutoff = new Date(now - STALE_MODEL_RENDER_MS)
  const rows = db
    .select()
    .from(modelRender)
    .where(eq(modelRender.status, 'processing'))
    .all()
    .filter((r) => r.createdAt.getTime() < cutoff.getTime())
  for (const r of rows) {
    db.transaction((tx) => {
      const fresh = tx.select().from(modelRender).where(eq(modelRender.id, r.id)).get()
      if (fresh?.status !== 'processing') return
      tx.update(modelRender)
        .set({ status: 'failed', errorMessage: 'render timed out', completedAt: new Date() })
        .where(eq(modelRender.id, r.id))
        .run()
    })
  }
  if (rows.length > 0)
    log?.warn({ event: 'model_render.stale', count: rows.length }, 'stale model renders failed')
  return rows.length
}
