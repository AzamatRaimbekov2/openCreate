// apps/api/test/films-render-reasons.test.ts
// Every way `buildPlan` can REFUSE an export, and the machine-readable reason it
// must carry.
//
// WHY THIS EXISTS: the nine refusals used to arrive at the client as one code
// (`validation_failed`) and one string — "something on the timeline isn't ready".
// That sentence cannot tell a user whether to WAIT, REGENERATE, or REMOVE, and
// those are the only three things they can do. A reason code per cause is what
// makes the copy honest.
//
// Two of the nine are SPLITS of a single throw site: a still-processing clip and
// a failed clip both came out of the same `status !== 'succeeded'` branch, and
// they need opposite instructions. Same on the audio side. Those splits are the
// point of this file.
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDb } from '../src/db/client'
import { createLocalStorage } from '../src/storage/local'
import { createFilmService, FilmValidationError } from '../src/modules/films/service'
import { generation, user } from '../src/db/schema'

const USER = 'user-1'

function service() {
  const db = createDb(':memory:').db
  const now = new Date()
  db.insert(user)
    .values({ id: USER, email: 'u@t.co', emailVerified: false, createdAt: now, updatedAt: now })
    .run()
  const storage = createLocalStorage(mkdtempSync(join(tmpdir(), 'oc-reason-')))
  return { db, svc: createFilmService({ db, storage }), storage }
}

function seedGeneration(
  db: ReturnType<typeof createDb>['db'],
  id: string,
  type: 'video' | 'audio',
  status: 'processing' | 'succeeded' | 'failed',
) {
  db.insert(generation)
    .values({
      id,
      userId: USER,
      type,
      mode: 'text',
      status,
      prompt: 'x',
      modelId: type === 'audio' ? 'voiceover' : 'wan-2-7',
      paramsJson: '{}',
      costCredits: 8,
      mediaJson: JSON.stringify([`/media/${id}.${type === 'audio' ? 'mp3' : 'mp4'}`]),
      createdAt: new Date(),
    })
    .run()
}

// Run createRender and hand back the refusal, so each test asserts on fields
// rather than re-writing the same try/catch. createRender is async (ADR
// railway-deployment D2 — it awaits storage.materialize() for every referenced
// asset), so a refusal now arrives as a rejection, not a synchronous throw.
async function refusalOf(fn: () => Promise<unknown>): Promise<FilmValidationError> {
  try {
    await fn()
  } catch (error) {
    if (error instanceof FilmValidationError) return error
    throw error
  }
  throw new Error('expected the export to be refused, but it was not')
}

describe('render refusal reasons — audio', () => {
  it('reports a still-processing track as audio_processing, naming the track', async () => {
    // The user attached a voiceover while the TTS job was in flight. Correct
    // instruction: WAIT. It resolves itself.
    const { db, svc } = service()
    const film = await svc.createFilm(USER, { title: 'F', aspectRatio: '16:9' })
    svc.addShot(USER, film.id, { title: { text: 'x', position: 'center' }, durationMs: 2000 })
    seedGeneration(db, 'gen-pending', 'audio', 'processing')
    const track = svc.addAudio(USER, film.id, {
      kind: 'voiceover',
      generationId: 'gen-pending',
    })

    const refusal = await refusalOf(() => svc.createRender(USER, film.id))

    expect(refusal.reason).toBe('audio_processing')
    expect(refusal.subjectKind).toBe('audio')
    expect(refusal.subjectId).toBe(track.id)
  })

  it('reports a failed track as audio_failed — a DIFFERENT reason, same throw site', async () => {
    // Correct instruction: REMOVE. Waiting will never help. This is the split.
    const { db, svc } = service()
    const film = await svc.createFilm(USER, { title: 'F', aspectRatio: '16:9' })
    svc.addShot(USER, film.id, { title: { text: 'x', position: 'center' }, durationMs: 2000 })
    seedGeneration(db, 'gen-bad', 'audio', 'failed')
    const track = svc.addAudio(USER, film.id, { kind: 'music', generationId: 'gen-bad' })

    const refusal = await refusalOf(() => svc.createRender(USER, film.id))

    expect(refusal.reason).toBe('audio_failed')
    expect(refusal.subjectId).toBe(track.id)
  })

  it('reports a vanished audio generation as audio_generation_missing', async () => {
    const { db, svc } = service()
    const film = await svc.createFilm(USER, { title: 'F', aspectRatio: '16:9' })
    svc.addShot(USER, film.id, { title: { text: 'x', position: 'center' }, durationMs: 2000 })
    seedGeneration(db, 'gen-gone', 'audio', 'succeeded')
    svc.addAudio(USER, film.id, { kind: 'music', generationId: 'gen-gone' })
    db.delete(generation).run()

    expect((await refusalOf(() => svc.createRender(USER, film.id))).reason).toBe(
      'audio_generation_missing',
    )
  })

  it('reports a succeeded track whose FILE is gone as audio_media_missing', async () => {
    const { db, svc } = service()
    const film = await svc.createFilm(USER, { title: 'F', aspectRatio: '16:9' })
    svc.addShot(USER, film.id, { title: { text: 'x', position: 'center' }, durationMs: 2000 })
    seedGeneration(db, 'gen-nofile', 'audio', 'succeeded')
    svc.addAudio(USER, film.id, { kind: 'music', generationId: 'gen-nofile' })

    expect((await refusalOf(() => svc.createRender(USER, film.id))).reason).toBe(
      'audio_media_missing',
    )
  })
})

describe('render refusal reasons — shots', () => {
  it('reports a still-generating clip as shot_clip_processing, naming the shot', async () => {
    const { db, svc } = service()
    const film = await svc.createFilm(USER, { title: 'F', aspectRatio: '16:9' })
    seedGeneration(db, 'gen-run', 'video', 'processing')
    const shot = svc.addShot(USER, film.id, { generationId: 'gen-run', durationMs: 2000 })

    const refusal = await refusalOf(() => svc.createRender(USER, film.id))

    expect(refusal.reason).toBe('shot_clip_processing')
    expect(refusal.subjectKind).toBe('shot')
    expect(refusal.subjectId).toBe(shot.id)
  })

  it('reports a failed clip as shot_clip_failed — the shot-side split', async () => {
    // Same throw site as above, opposite instruction: REGENERATE, do not wait.
    const { db, svc } = service()
    const film = await svc.createFilm(USER, { title: 'F', aspectRatio: '16:9' })
    seedGeneration(db, 'gen-dead', 'video', 'failed')
    const shot = svc.addShot(USER, film.id, { generationId: 'gen-dead', durationMs: 2000 })

    const refusal = await refusalOf(() => svc.createRender(USER, film.id))

    expect(refusal.reason).toBe('shot_clip_failed')
    expect(refusal.subjectId).toBe(shot.id)
  })

  it('reports a vanished clip as shot_clip_missing', async () => {
    const { db, svc } = service()
    const film = await svc.createFilm(USER, { title: 'F', aspectRatio: '16:9' })
    seedGeneration(db, 'gen-vanish', 'video', 'succeeded')
    svc.addShot(USER, film.id, { generationId: 'gen-vanish', durationMs: 2000 })
    db.delete(generation).run()

    expect((await refusalOf(() => svc.createRender(USER, film.id))).reason).toBe('shot_clip_missing')
  })

  it('reports an audio clip used as a shot as shot_clip_is_audio', async () => {
    const { db, svc } = service()
    const film = await svc.createFilm(USER, { title: 'F', aspectRatio: '16:9' })
    seedGeneration(db, 'gen-sound', 'audio', 'succeeded')
    svc.addShot(USER, film.id, { generationId: 'gen-sound', durationMs: 2000 })

    expect((await refusalOf(() => svc.createRender(USER, film.id))).reason).toBe('shot_clip_is_audio')
  })

  it('reports a succeeded clip whose FILE is gone as shot_media_missing', async () => {
    const { db, svc } = service()
    const film = await svc.createFilm(USER, { title: 'F', aspectRatio: '16:9' })
    seedGeneration(db, 'gen-nofile', 'video', 'succeeded')
    svc.addShot(USER, film.id, { generationId: 'gen-nofile', durationMs: 2000 })

    expect((await refusalOf(() => svc.createRender(USER, film.id))).reason).toBe('shot_media_missing')
  })
})

describe('render refusal reasons — film', () => {
  it('reports an empty timeline as film_no_shots, with the film as the subject', async () => {
    const { svc } = service()
    const film = await svc.createFilm(USER, { title: 'F', aspectRatio: '16:9' })

    const refusal = await refusalOf(() => svc.createRender(USER, film.id))

    expect(refusal.reason).toBe('film_no_shots')
    expect(refusal.subjectKind).toBe('film')
  })
})

describe('a render that CAN proceed', () => {
  it('does not refuse when every cited clip and track is ready', async () => {
    // The negative control: without it, a bug that refuses everything would make
    // every test above pass for the wrong reason.
    const { db, svc, storage } = service()
    const film = await svc.createFilm(USER, { title: 'F', aspectRatio: '16:9' })
    svc.addShot(USER, film.id, { title: { text: 'x', position: 'center' }, durationMs: 2000 })
    seedGeneration(db, 'gen-ok', 'audio', 'succeeded')
    writeFileSync(storage.scratchPath('gen-ok', 'mp3'), 'exists')
    svc.addAudio(USER, film.id, { kind: 'music', generationId: 'gen-ok' })

    expect((await svc.createRender(USER, film.id)).status).toBe('processing')
  })
})
