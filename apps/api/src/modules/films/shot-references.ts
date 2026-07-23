// apps/api/src/modules/films/shot-references.ts
// Attaching arbitrary reference images DIRECTLY to a Cinema shot (not tagged
// Entities), and delivering them to the model on (re-)generate.
//
// This lives in its OWN small module, not in films/service.ts, on purpose: that
// file is already past the 500-line guideline, and the task was explicit about
// not worsening it. The three operations here are self-contained.
//
// Two disciplines carried over from the rest of the codebase:
//  1. OWNERSHIP IS THE TYPE SIGNATURE. requireShot takes userId first and scopes
//     every query by it; the SAME 404 for "missing" and "not yours" so an
//     attacker cannot probe shot-id existence.
//  2. THE MONEY PATH IS UNTOUCHED. createClip charges nothing and refunds
//     nothing — it hands a CreateGenerationServiceInput to generations.create(),
//     the single money path. If this file ever imports the ledger, the design
//     has gone wrong (the assets3d.extract rule).
import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { MAX_SHOT_REFERENCE_IMAGES } from '@opencreate/contracts'
import type {
  EntityRef,
  GenerateShotClipInput,
  Generation,
  Shot,
  ShotReferenceImage,
} from '@opencreate/contracts'
import type { Db } from '../../db/client'
import type { StorageProvider } from '../../storage/local'
import { InvalidImageDataUriError } from '../../storage/dataUri'
import { film, shot } from '../../db/schema'
import type { CreateGenerationServiceInput, GenerationService } from '../generations/service'
import { FilmNotFoundError, FilmValidationError, toShotDto } from './service'

// The generation service narrowed to the ONE method createClip may call. Stating
// that in the type is the cheapest guard against this file growing a second money
// path (a poll here, a refund there), and lets tests hand over a fake create().
type ClipGenerations = Pick<GenerationService, 'create'>

export type ShotReferenceService = ReturnType<typeof createShotReferenceService>

export function createShotReferenceService({
  db,
  storage,
  generations,
}: {
  db: Db
  storage: StorageProvider
  generations: ClipGenerations
}) {
  // Ownership gate: the film must be the caller's AND the shot must belong to it.
  // Same 404 for both, mirroring films/service.ts's own requireShot (re-implemented
  // here rather than exported from a closure so this module stays self-contained).
  function requireShot(userId: string, filmId: string, shotId: string) {
    const filmRow = db
      .select()
      .from(film)
      .where(and(eq(film.id, filmId), eq(film.userId, userId)))
      .get()
    if (!filmRow) throw new FilmNotFoundError()
    const shotRow = db
      .select()
      .from(shot)
      .where(and(eq(shot.id, shotId), eq(shot.filmId, filmId)))
      .get()
    if (!shotRow) throw new FilmNotFoundError()
    return shotRow
  }
  const touchFilm = (filmId: string) =>
    db.update(film).set({ updatedAt: new Date() }).where(eq(film.id, filmId)).run()

  const readRefs = (row: typeof shot.$inferSelect): ShotReferenceImage[] =>
    row.referenceImagesJson ? (JSON.parse(row.referenceImagesJson) as ShotReferenceImage[]) : []
  const countEntityRefs = (row: typeof shot.$inferSelect): number =>
    row.entityRefsJson ? (JSON.parse(row.entityRefsJson) as EntityRef[]).length : 0

  // Store an uploaded image on the shot. Budget-checked BEFORE any bytes touch the
  // disk, so the (N+1)th upload is a clean 400 rather than a surprise at generate.
  async function addReference(
    userId: string,
    filmId: string,
    shotId: string,
    dataUri: string,
  ): Promise<Shot> {
    const shotRow = requireShot(userId, filmId, shotId)
    // SHARED budget: entity tags AND attached images together count against the same
    // ceiling (a generation conditions on both). Capped here so the composer's "5/5"
    // is truth; the per-generation gate does the model-SPECIFIC final check (a model
    // that accepts fewer refuses before charging). >= because at the cap the next
    // upload overflows it.
    const used = countEntityRefs(shotRow) + readRefs(shotRow).length
    if (used >= MAX_SHOT_REFERENCE_IMAGES)
      throw new FilmValidationError(`a shot can carry at most ${MAX_SHOT_REFERENCE_IMAGES} references`)
    // Store the bytes in OUR storage under a fresh media key (independent of the shot
    // id). saveDataUri → parseImageDataUri re-guards the DISK: raster only (no svg
    // stored-XSS), decoded-byte cap. A rejected payload is the client's fault → a 400,
    // not a 500 leaking InvalidImageDataUriError out of the service.
    let path: string
    try {
      path = await storage.saveDataUri(dataUri, randomUUID())
    } catch (err) {
      if (err instanceof InvalidImageDataUriError) throw new FilmValidationError(err.message)
      throw err
    }
    const next: ShotReferenceImage[] = [...readRefs(shotRow), { id: randomUUID(), path }]
    db.update(shot).set({ referenceImagesJson: JSON.stringify(next) }).where(eq(shot.id, shotId)).run()
    touchFilm(filmId)
    return toShotDto(db.select().from(shot).where(eq(shot.id, shotId)).get()!)
  }

  // Drop one attached image. The stored media FILE is left on disk (a harmless
  // orphan a future sweep reclaims) — the same way entity/asset deletion treats its
  // media. Removing an unknown refId is a no-op, not a 404: the client's goal ("this
  // ref is gone") is already satisfied.
  function removeReference(userId: string, filmId: string, shotId: string, refId: string): Shot {
    const shotRow = requireShot(userId, filmId, shotId)
    const next = readRefs(shotRow).filter((r) => r.id !== refId)
    db.update(shot)
      .set({ referenceImagesJson: next.length ? JSON.stringify(next) : null })
      .where(eq(shot.id, shotId))
      .run()
    touchFilm(filmId)
    return toShotDto(db.select().from(shot).where(eq(shot.id, shotId)).get()!)
  }

  // THE DELIVERY SEAM. The client sends the same body it would send to
  // POST /api/generations (model-resolved by composeShotClipInput). The shot's
  // ATTACHED images are read back from storage into the server-only referenceImages
  // channel HERE — the wire contract has no such field, so a client can never inject
  // reference-image bytes. Because the images are PERSISTED on the shot, a re-generate
  // re-reads and re-sends them: that is how an attachment survives being regenerated.
  // Everything money-touching stays inside generations.create(); this only sources the
  // bytes it will not let the client provide.
  async function createClip(
    userId: string,
    filmId: string,
    shotId: string,
    input: GenerateShotClipInput,
    reqLog?: Parameters<GenerationService['create']>[2],
  ): Promise<{ dto: Generation; created: boolean }> {
    const shotRow = requireShot(userId, filmId, shotId)
    const refs = readRefs(shotRow)
    // Runware conditions on data URIs, and our /media paths are not publicly reachable
    // — read the stored images back as data URIs. Only when there are any, so
    // exactOptionalPropertyTypes keeps an empty referenceImages key out of the input.
    const referenceImages =
      refs.length > 0 ? await Promise.all(refs.map((r) => storage.readAsDataUri(r.path))) : undefined
    const serviceInput: CreateGenerationServiceInput = {
      ...input,
      ...(referenceImages ? { referenceImages } : {}),
    }
    return generations.create(userId, serviceInput, reqLog)
  }

  return { addReference, removeReference, createClip }
}
