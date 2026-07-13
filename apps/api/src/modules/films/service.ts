// apps/api/src/modules/films/service.ts
// CinemaStudio domain service: films, their ordered shots, audio tracks, and
// ffmpeg render jobs. ADR: docs/wiki/decisions/cinema-studio.md.
//
// Two disciplines carried over from the rest of the codebase:
//  1. OWNERSHIP IS THE TYPE SIGNATURE. Every method takes `userId` first and
//     scopes every query by it (via requireFilm). A filmId/shotId/renderId
//     arrives from the client, so a missing scope would expose another user's
//     film. The SAME not-found error is used for "does not exist" and "not
//     yours" so an attacker cannot probe id existence.
//  2. RENDER SETTLEMENT IS STATUS-GUARDED, but there is NO ledger — a render
//     spends our CPU, not a provider invoice (ADR §2). So the render row moves
//     processing → succeeded/failed exactly once, and there is nothing to refund.
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { and, asc, desc, eq } from 'drizzle-orm'
import type {
  AddFilmAudioInput,
  CreateFilmInput,
  CreateShotInput,
  EntityRef,
  Film,
  FilmAudio,
  FilmDetail,
  FilmRender,
  PromptPreset,
  Shot,
  ShotTitle,
  ShotVoiceover,
  UpdateFilmInput,
  UpdateShotInput,
} from '@opencreate/contracts'
import type { Db } from '../../db/client'
import type { StorageProvider } from '../../storage/local'
import { film, filmAudio, filmRender, generation, shot } from '../../db/schema'
import {
  buildFfmpegArgs,
  canvasFor,
  createSemaphore,
  resolveFontPath,
  runFfmpeg,
  totalDurationMs,
  type RenderAudio,
  type RenderPlan,
  type RenderSegment,
} from './render'

// Reuse the generation service's domain-error shapes so app.ts's central handler
// maps them to the ApiError envelope with no per-route mapping.
export class FilmNotFoundError extends Error {
  statusCode = 404
  apiCode = 'not_found'
  constructor() {
    super('film not found')
  }
}
export class FilmValidationError extends Error {
  statusCode = 400
  apiCode = 'validation_failed'
}

// Order-index spacing: new shots append at (max + STEP); a reorder reassigns
// STEP, 2·STEP, … Large gaps leave room for a future midpoint insert without a
// renumber. REAL column, so fractional midpoints are representable.
const ORDER_STEP = 1000

// How long a render may stay 'processing' before the boot reaper fails it. A
// render whose process died (crash mid-ffmpeg) would otherwise hold 'processing'
// forever with no poller to settle it. 30 min is far beyond any real render.
export const STALE_RENDER_MS = 30 * 60 * 1000

// Max concurrent ffmpeg processes across the whole API process. ffmpeg is
// CPU-bound and this process also serves HTTP and holds the SQLite file, so a
// low bound protects latency.
const MAX_CONCURRENT_RENDERS = 2

type Deps = {
  db: Db
  storage: StorageProvider
  // Injectable for tests: a fake that resolves instantly instead of spawning
  // ffmpeg lets the render lifecycle be exercised without a real binary.
  runRender?: (args: string[], totalMs: number, onProgress: (p: number) => void) => Promise<
    { ok: true } | { ok: false; error: string }
  >
}

export type FilmService = ReturnType<typeof createFilmService>

export function createFilmService({ db, storage, runRender }: Deps) {
  const semaphore = createSemaphore(MAX_CONCURRENT_RENDERS)
  const runner = runRender ?? ((args, totalMs, onProgress) => runFfmpeg(args, totalMs, onProgress))

  // ── DTO mappers ─────────────────────────────────────────────────────────
  function toFilmDto(row: typeof film.$inferSelect): Film {
    return {
      id: row.id,
      title: row.title,
      aspectRatio: row.aspectRatio,
      defaultStyleId: row.defaultStyleId as Film['defaultStyleId'],
      templateId: row.templateId,
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
    }
  }
  function toShotDto(row: typeof shot.$inferSelect): Shot {
    return {
      id: row.id,
      filmId: row.filmId,
      orderIndex: row.orderIndex,
      generationId: row.generationId,
      prompt: row.prompt,
      promptPreset: row.promptPresetJson ? (JSON.parse(row.promptPresetJson) as PromptPreset) : null,
      // Never null on the wire: the contract promises an ARRAY, and a client that
      // has to null-check a cast before mapping it is a client that will forget to.
      // A shot from before this column simply has nobody in it.
      entityRefs: row.entityRefsJson ? (JSON.parse(row.entityRefsJson) as EntityRef[]) : [],
      modelId: row.modelId,
      durationMs: row.durationMs,
      trimStartMs: row.trimStartMs,
      transition: row.transition,
      transitionMs: row.transitionMs,
      title: row.titleJson ? (JSON.parse(row.titleJson) as ShotTitle) : null,
      voiceover: row.voiceoverJson ? (JSON.parse(row.voiceoverJson) as ShotVoiceover) : null,
      createdAt: new Date(row.createdAt).toISOString(),
    }
  }
  function toAudioDto(row: typeof filmAudio.$inferSelect): FilmAudio {
    return {
      id: row.id,
      filmId: row.filmId,
      kind: row.kind,
      generationId: row.generationId,
      shotId: row.shotId,
      startMs: row.startMs,
      gainDb: row.gainDb,
    }
  }
  function toRenderDto(row: typeof filmRender.$inferSelect): FilmRender {
    return {
      id: row.id,
      filmId: row.filmId,
      status: row.status,
      progress: row.progress,
      mediaUrl: row.mediaJson ? ((JSON.parse(row.mediaJson) as string[])[0] ?? null) : null,
      errorMessage: row.errorMessage,
      createdAt: new Date(row.createdAt).toISOString(),
      completedAt: row.completedAt ? new Date(row.completedAt).toISOString() : null,
    }
  }

  // Ownership gate: the film must exist AND belong to the caller. Same error for
  // both so a foreign id is indistinguishable from a missing one.
  function requireFilm(userId: string, filmId: string) {
    const row = db
      .select()
      .from(film)
      .where(and(eq(film.id, filmId), eq(film.userId, userId)))
      .get()
    if (!row) throw new FilmNotFoundError()
    return row
  }
  const touchFilm = (filmId: string) =>
    db.update(film).set({ updatedAt: new Date() }).where(eq(film.id, filmId)).run()

  // ── Films ─────────────────────────────────────────────────────────────────
  function createFilm(userId: string, input: CreateFilmInput): Film {
    const id = randomUUID()
    const now = new Date()
    db.insert(film)
      .values({
        id,
        userId,
        title: input.title.trim(),
        aspectRatio: input.aspectRatio,
        defaultStyleId: input.defaultStyleId ?? null,
        // A hand-made film has no template. Only createFromTemplate stamps one —
        // provenance is a fact the server establishes, never a client claim.
        templateId: null,
        createdAt: now,
        updatedAt: now,
      })
      .run()
    return toFilmDto(db.select().from(film).where(eq(film.id, id)).get()!)
  }

  // Instantiate a whole film — the project row AND every shot — in ONE
  // transaction. This is the template catalog's entry point (ADR: template-
  // catalog) and the only bulk-create path in the service.
  //
  // Why it is not "createFilm() then addShot() × 8":
  //  · Atomicity. A crash between shot 5 and 6 would leave the user staring at
  //    half a drama with no way to tell it apart from a finished one. A template
  //    either lands whole or not at all.
  //  · Round trips. Eight POSTs and eight ['film', id] cache invalidations to put
  //    up one screen is a visibly slow way to do an instant action.
  //  · orderIndex. addShot recomputes max(orderIndex) per insert; here the order
  //    is already known, so the indices are just (i+1)·STEP.
  //
  // It charges nothing and generates nothing: every shot lands with
  // generationId = null. The prompts, presets, model and spoken lines are filled
  // in — the credits are spent later, per shot, by the user.
  function createFromTemplate(
    userId: string,
    templateId: string,
    input: CreateFilmInput,
    shots: CreateShotInput[],
  ): FilmDetail {
    const id = randomUUID()
    const now = new Date()
    db.transaction((tx) => {
      tx.insert(film)
        .values({
          id,
          userId,
          title: input.title.trim(),
          aspectRatio: input.aspectRatio,
          defaultStyleId: input.defaultStyleId ?? null,
          templateId,
          createdAt: now,
          updatedAt: now,
        })
        .run()
      shots.forEach((s, i) => {
        tx.insert(shot)
          .values({
            id: randomUUID(),
            filmId: id,
            orderIndex: (i + 1) * ORDER_STEP,
            generationId: null,
            prompt: (s.prompt ?? '').trim(),
            promptPresetJson: s.promptPreset ? JSON.stringify(s.promptPreset) : null,
            // A template can ship a cast per beat — the whole point of a cartoon
            // template being that the SAME character carries every shot.
            entityRefsJson: s.entityRefs?.length ? JSON.stringify(s.entityRefs) : null,
            modelId: s.modelId ?? null,
            durationMs: s.durationMs ?? 3000,
            trimStartMs: s.trimStartMs ?? 0,
            transition: s.transition ?? 'none',
            transitionMs: s.transitionMs ?? 0,
            titleJson: s.title ? JSON.stringify(s.title) : null,
            voiceoverJson: s.voiceover ? JSON.stringify(s.voiceover) : null,
            createdAt: now,
          })
          .run()
      })
    })
    return getFilm(userId, id)
  }

  function listFilms(userId: string): Film[] {
    return db
      .select()
      .from(film)
      .where(eq(film.userId, userId))
      .orderBy(desc(film.updatedAt))
      .all()
      .map(toFilmDto)
  }

  function getFilm(userId: string, filmId: string): FilmDetail {
    const row = requireFilm(userId, filmId)
    const shots = db
      .select()
      .from(shot)
      .where(eq(shot.filmId, filmId))
      .orderBy(asc(shot.orderIndex))
      .all()
      .map(toShotDto)
    const audio = db.select().from(filmAudio).where(eq(filmAudio.filmId, filmId)).all().map(toAudioDto)
    return { film: toFilmDto(row), shots, audio }
  }

  function updateFilm(userId: string, filmId: string, input: UpdateFilmInput): Film {
    requireFilm(userId, filmId)
    const patch: Partial<typeof film.$inferInsert> = { updatedAt: new Date() }
    if (input.title !== undefined) patch.title = input.title.trim()
    if (input.aspectRatio !== undefined) patch.aspectRatio = input.aspectRatio
    if (input.defaultStyleId !== undefined) patch.defaultStyleId = input.defaultStyleId
    db.update(film).set(patch).where(eq(film.id, filmId)).run()
    return toFilmDto(db.select().from(film).where(eq(film.id, filmId)).get()!)
  }

  function deleteFilm(userId: string, filmId: string): void {
    requireFilm(userId, filmId)
    // Cascade (schema FKs) removes shots/audio/renders. Render output files under
    // /media are left to be cleaned by a future sweep — harmless orphans.
    db.delete(film).where(eq(film.id, filmId)).run()
  }

  // ── Shots ───────────────────────────────────────────────────────────────
  function nextOrderIndex(filmId: string): number {
    const rows = db
      .select({ orderIndex: shot.orderIndex })
      .from(shot)
      .where(eq(shot.filmId, filmId))
      .orderBy(desc(shot.orderIndex))
      .limit(1)
      .all()
    return (rows[0]?.orderIndex ?? 0) + ORDER_STEP
  }

  function addShot(userId: string, filmId: string, input: CreateShotInput): Shot {
    requireFilm(userId, filmId)
    const id = randomUUID()
    db.insert(shot)
      .values({
        id,
        filmId,
        orderIndex: nextOrderIndex(filmId),
        generationId: input.generationId ?? null,
        prompt: (input.prompt ?? '').trim(),
        promptPresetJson: input.promptPreset ? JSON.stringify(input.promptPreset) : null,
        // An EMPTY cast stores as null, not as '[]': "nobody is tagged" is the
        // same fact however it arrived, and one representation means the read path
        // has one branch instead of two.
        entityRefsJson: input.entityRefs?.length ? JSON.stringify(input.entityRefs) : null,
        modelId: input.modelId ?? null,
        // Default a 3s slot so a freshly-added shot has a real timeline length.
        durationMs: input.durationMs ?? 3000,
        trimStartMs: input.trimStartMs ?? 0,
        transition: input.transition ?? 'none',
        transitionMs: input.transitionMs ?? 0,
        titleJson: input.title ? JSON.stringify(input.title) : null,
        voiceoverJson: input.voiceover ? JSON.stringify(input.voiceover) : null,
        createdAt: new Date(),
      })
      .run()
    touchFilm(filmId)
    return toShotDto(db.select().from(shot).where(eq(shot.id, id)).get()!)
  }

  function requireShot(userId: string, filmId: string, shotId: string) {
    requireFilm(userId, filmId)
    const row = db
      .select()
      .from(shot)
      .where(and(eq(shot.id, shotId), eq(shot.filmId, filmId)))
      .get()
    if (!row) throw new FilmNotFoundError()
    return row
  }

  function updateShot(userId: string, filmId: string, shotId: string, input: UpdateShotInput): Shot {
    requireShot(userId, filmId, shotId)
    const patch: Partial<typeof shot.$inferInsert> = {}
    if (input.generationId !== undefined) patch.generationId = input.generationId
    if (input.prompt !== undefined) patch.prompt = input.prompt.trim()
    if (input.promptPreset !== undefined)
      patch.promptPresetJson = input.promptPreset ? JSON.stringify(input.promptPreset) : null
    // `undefined` = the client did not touch the cast; an EMPTY array = it removed
    // everyone. Collapsing the two would make un-tagging the last character
    // impossible — the very edit a user makes when a shot turns out not to need her.
    if (input.entityRefs !== undefined)
      patch.entityRefsJson = input.entityRefs.length ? JSON.stringify(input.entityRefs) : null
    if (input.modelId !== undefined) patch.modelId = input.modelId
    if (input.durationMs !== undefined) patch.durationMs = input.durationMs
    if (input.trimStartMs !== undefined) patch.trimStartMs = input.trimStartMs
    if (input.transition !== undefined) patch.transition = input.transition
    if (input.transitionMs !== undefined) patch.transitionMs = input.transitionMs
    if (input.title !== undefined) patch.titleJson = input.title ? JSON.stringify(input.title) : null
    if (input.voiceover !== undefined)
      patch.voiceoverJson = input.voiceover ? JSON.stringify(input.voiceover) : null
    db.update(shot).set(patch).where(eq(shot.id, shotId)).run()
    touchFilm(filmId)
    return toShotDto(db.select().from(shot).where(eq(shot.id, shotId)).get()!)
  }

  function deleteShot(userId: string, filmId: string, shotId: string): void {
    requireShot(userId, filmId, shotId)
    db.delete(shot).where(eq(shot.id, shotId)).run()
    touchFilm(filmId)
  }

  // Reorder = the full ordered list of this film's shot ids. Every id must be a
  // shot of THIS film (else the client is trying to move a foreign shot in).
  // Reassigns evenly-spaced orderIndex in one transaction.
  function reorderShots(userId: string, filmId: string, shotIds: string[]): Shot[] {
    requireFilm(userId, filmId)
    const existing = db.select({ id: shot.id }).from(shot).where(eq(shot.filmId, filmId)).all()
    const existingIds = new Set(existing.map((r) => r.id))
    if (shotIds.length !== existingIds.size || !shotIds.every((sid) => existingIds.has(sid)))
      throw new FilmValidationError('shotIds must be exactly this film’s shots')
    db.transaction((tx) => {
      shotIds.forEach((sid, i) => {
        tx.update(shot)
          .set({ orderIndex: (i + 1) * ORDER_STEP })
          .where(eq(shot.id, sid))
          .run()
      })
    })
    touchFilm(filmId)
    return getFilm(userId, filmId).shots
  }

  // ── Audio ───────────────────────────────────────────────────────────────
  function addAudio(userId: string, filmId: string, input: AddFilmAudioInput): FilmAudio {
    requireFilm(userId, filmId)
    // The cited generation must be the caller's, succeeded, and actually audio —
    // otherwise the render would try to mix a non-existent or non-audio file.
    const gen = db
      .select()
      .from(generation)
      .where(and(eq(generation.id, input.generationId), eq(generation.userId, userId)))
      .get()
    if (!gen || gen.type !== 'audio') throw new FilmValidationError('not an audio generation')
    // The status check the comment above always PROMISED but never performed.
    // Without it a still-processing voiceover could be attached: the Audio panel
    // showed the track at once, and a render started before the mp3 landed on
    // disk mixed nothing and still reported success — a silent film the user had
    // already paid for. Attaching is only legal once the asset actually exists.
    if (gen.status !== 'succeeded')
      throw new FilmValidationError('audio generation is not ready yet')
    // A shot-attached track REPLACES whatever already voices that shot. Appending
    // would mean a second click on "voice this shot" leaves two lines playing over
    // each other — and the user paid twice to make it worse. The shot must be this
    // film's, or the client is trying to attach a track to someone else's timeline.
    if (input.shotId) {
      requireShot(userId, filmId, input.shotId)
      db.delete(filmAudio)
        .where(and(eq(filmAudio.filmId, filmId), eq(filmAudio.shotId, input.shotId)))
        .run()
    }
    const id = randomUUID()
    db.insert(filmAudio)
      .values({
        id,
        filmId,
        kind: input.kind,
        generationId: input.generationId,
        shotId: input.shotId ?? null,
        startMs: input.startMs ?? 0,
        gainDb: input.gainDb ?? 0,
      })
      .run()
    touchFilm(filmId)
    return toAudioDto(db.select().from(filmAudio).where(eq(filmAudio.id, id)).get()!)
  }

  function deleteAudio(userId: string, filmId: string, audioId: string): void {
    requireFilm(userId, filmId)
    const row = db
      .select()
      .from(filmAudio)
      .where(and(eq(filmAudio.id, audioId), eq(filmAudio.filmId, filmId)))
      .get()
    if (!row) throw new FilmNotFoundError()
    db.delete(filmAudio).where(eq(filmAudio.id, audioId)).run()
    touchFilm(filmId)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  // Resolve the timeline into a RenderPlan (minus outputPath). Throws a 400 for
  // any shot/audio whose media is missing or not yet ready — a render must never
  // silently drop footage the user arranged.
  function buildPlan(userId: string, filmRow: typeof film.$inferSelect): Omit<RenderPlan, 'outputPath'> {
    const canvas = canvasFor(filmRow.aspectRatio)
    const shots = db
      .select()
      .from(shot)
      .where(eq(shot.filmId, filmRow.id))
      .orderBy(asc(shot.orderIndex))
      .all()

    const segments: RenderSegment[] = []
    for (const s of shots) {
      const durationSec = s.durationMs / 1000
      const trimStartSec = s.trimStartMs / 1000
      const title = s.titleJson ? (JSON.parse(s.titleJson) as ShotTitle) : null
      const crossfade = s.transition === 'crossfade'
      const transitionSec = s.transitionMs / 1000

      if (s.generationId) {
        const gen = db
          .select()
          .from(generation)
          .where(and(eq(generation.id, s.generationId), eq(generation.userId, userId)))
          .get()
        if (!gen) throw new FilmValidationError('a shot references a clip that no longer exists')
        if (gen.status !== 'succeeded')
          throw new FilmValidationError('a shot’s clip is not ready yet — wait for it to finish')
        if (gen.type === 'audio') throw new FilmValidationError('audio cannot be used as a shot')
        const ext = gen.type === 'video' ? 'mp4' : 'webp'
        const file = storage.localPath(gen.id, ext)
        if (!existsSync(file)) throw new FilmValidationError('a shot’s media file is missing')
        segments.push({
          file,
          kind: gen.type === 'video' ? 'video' : 'image',
          durationSec,
          trimStartSec,
          crossfade,
          transitionSec,
          title,
        })
      } else if (title) {
        // A title-only shot renders as a card over a black background.
        segments.push({ file: null, kind: 'title', durationSec, trimStartSec, crossfade, transitionSec, title })
      }
      // A shot with neither a generation nor a title is an empty placeholder — skip it.
    }

    if (segments.length === 0)
      throw new FilmValidationError('film has no renderable shots — add a clip or a title')

    const audio: RenderAudio[] = []
    const tracks = db.select().from(filmAudio).where(eq(filmAudio.filmId, filmRow.id)).all()
    for (const a of tracks) {
      const gen = db
        .select()
        .from(generation)
        .where(and(eq(generation.id, a.generationId), eq(generation.userId, userId)))
        .get()
      // A track the user attached and PAID for must reach the mux or stop the
      // export. The previous `if (existsSync) push` silently skipped anything
      // missing and let the render settle as 'succeeded' — the single worst
      // outcome, because a muted mp4 looks finished. addAudio now refuses any
      // non-succeeded generation, so reaching this branch means the row is fine
      // but the ASSET is gone (pruned, expired, or a lost save). That is a real
      // failure and says so: a 400 the user can act on, not a quiet downgrade.
      if (!gen || gen.type !== 'audio' || gen.status !== 'succeeded')
        throw new FilmValidationError('an audio track is not ready — remove it or wait for it')
      const file = storage.localPath(gen.id, 'mp3')
      if (!existsSync(file))
        throw new FilmValidationError('an audio track has no media file — remove it and re-add')
      audio.push({ file, startSec: a.startMs / 1000, gainDb: a.gainDb })
    }

    return { width: canvas.width, height: canvas.height, segments, audio, fontPath: resolveFontPath(), fps: 30 }
  }

  // Guarded terminal settle for a render row (mirrors the generation service's
  // status-guarded settle, minus the ledger): only a still-processing row moves
  // to a terminal state, so a boot reaper and the render promise cannot fight.
  function settleRender(
    renderId: string,
    status: 'succeeded' | 'failed',
    mediaUrl: string | null,
    errorMessage: string | null,
  ) {
    db.transaction((tx) => {
      const fresh = tx.select().from(filmRender).where(eq(filmRender.id, renderId)).get()
      if (fresh?.status !== 'processing') return
      tx.update(filmRender)
        .set({
          status,
          progress: status === 'succeeded' ? 100 : fresh.progress,
          mediaJson: mediaUrl ? JSON.stringify([mediaUrl]) : null,
          errorMessage,
          completedAt: new Date(),
        })
        .where(eq(filmRender.id, renderId))
        .run()
    })
  }

  async function runRenderJob(renderId: string, plan: RenderPlan, totalMs: number, mediaUrl: string) {
    const release = await semaphore.acquire()
    try {
      const args = buildFfmpegArgs(plan)
      const result = await runner(args, totalMs, (pct) => {
        // Progress is best-effort and status-guarded: never resurrect a settled row.
        db.update(filmRender)
          .set({ progress: pct })
          .where(and(eq(filmRender.id, renderId), eq(filmRender.status, 'processing')))
          .run()
      })
      if (result.ok) settleRender(renderId, 'succeeded', mediaUrl, null)
      else {
        // Failed ffmpeg → discard any partial output; a truncated mp4 must never
        // be served as a finished film.
        await storage.remove(renderId, 'mp4')
        settleRender(renderId, 'failed', null, result.error)
      }
    } catch (err) {
      await storage.remove(renderId, 'mp4').catch(() => undefined)
      settleRender(renderId, 'failed', null, err instanceof Error ? err.message : 'render failed')
    } finally {
      release()
    }
  }

  // Kick off a render: build the plan (may 400), insert the processing row, then
  // fire the ffmpeg job WITHOUT awaiting it (the SPA polls getRender). Returns
  // 202-shaped state immediately.
  function createRender(userId: string, filmId: string): FilmRender {
    const filmRow = requireFilm(userId, filmId)
    const planBase = buildPlan(userId, filmRow) // throws 400 before any row is written
    const id = randomUUID()
    const outputPath = storage.localPath(id, 'mp4')
    const mediaUrl = `/media/${id}.mp4`
    const now = new Date()
    db.insert(filmRender)
      .values({ id, filmId, userId, status: 'processing', progress: 0, createdAt: now })
      .run()
    const plan: RenderPlan = { ...planBase, outputPath }
    const totalMs = totalDurationMs(
      db.select().from(shot).where(eq(shot.filmId, filmId)).all(),
    )
    // Fire-and-forget: the promise settles the row; the request returns now.
    void runRenderJob(id, plan, totalMs, mediaUrl)
    return toRenderDto(db.select().from(filmRender).where(eq(filmRender.id, id)).get()!)
  }

  function getRender(userId: string, filmId: string, renderId: string): FilmRender {
    requireFilm(userId, filmId)
    const row = db
      .select()
      .from(filmRender)
      .where(and(eq(filmRender.id, renderId), eq(filmRender.filmId, filmId)))
      .get()
    if (!row) throw new FilmNotFoundError()
    return toRenderDto(row)
  }

  return {
    createFilm,
    createFromTemplate,
    listFilms,
    getFilm,
    updateFilm,
    deleteFilm,
    addShot,
    updateShot,
    deleteShot,
    reorderShots,
    addAudio,
    deleteAudio,
    createRender,
    getRender,
  }
}

// Boot-time reaper (wired in app.ts): a render whose process crashed mid-ffmpeg
// would hold 'processing' forever with no poller to settle it. Fail anything
// older than the staleness threshold. No refund — a render has no charge.
export function settleStaleRenders(db: Db, now = Date.now(), log?: { warn: (o: unknown, m: string) => void }): number {
  const cutoff = new Date(now - STALE_RENDER_MS)
  const rows = db
    .select()
    .from(filmRender)
    .where(eq(filmRender.status, 'processing'))
    .all()
    .filter((r) => r.createdAt.getTime() < cutoff.getTime())
  for (const r of rows) {
    db.transaction((tx) => {
      const fresh = tx.select().from(filmRender).where(eq(filmRender.id, r.id)).get()
      if (fresh?.status !== 'processing') return
      tx.update(filmRender)
        .set({ status: 'failed', errorMessage: 'render timed out', completedAt: new Date() })
        .where(eq(filmRender.id, r.id))
        .run()
    })
  }
  if (rows.length > 0) log?.warn({ event: 'render.stale', count: rows.length }, 'stale renders failed')
  return rows.length
}
