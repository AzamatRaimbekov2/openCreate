// apps/api/test/films-audio-integrity.test.ts
// Behavior: a film's audio must either REACH the exported mp4 or stop the export
// loudly — it must never be dropped in silence.
//
// The bug this pins down (found by an end-to-end run): addAudio's comment claimed
// the cited generation "must be the caller's, succeeded, and actually audio", but
// the code only checked `type`. A still-processing voiceover could therefore be
// attached to the timeline, the Audio panel showed it immediately, and a render
// started before the mp3 landed on disk skipped the track (`existsSync` false)
// and still settled as SUCCEEDED. The user paid for a voiceover and got a silent
// film with no warning anywhere.
//
// Two independent guards, one test each:
//   1. addAudio rejects a generation that is not succeeded (close the window).
//   2. buildPlan refuses to render when an attached track's file is missing
//      (any residual window — a pruned/expired asset — becomes a clean 400,
//      never a silently muted export).
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createDb } from '../src/db/client'
import { createLocalStorage } from '../src/storage/local'
import { createFilmService } from '../src/modules/films/service'
import { generation, user } from '../src/db/schema'

const USER = 'user-1'

function service() {
  const db = createDb(':memory:').db
  const now = new Date()
  db.insert(user)
    .values({ id: USER, email: 'u@t.co', emailVerified: false, createdAt: now, updatedAt: now })
    .run()
  const dir = mkdtempSync(join(tmpdir(), 'oc-audio-'))
  const storage = createLocalStorage(dir)
  // Never spawn ffmpeg: this suite is about what reaches the PLAN, not the codec.
  const runRender = vi.fn(async () => ({ ok: true as const }))
  const svc = createFilmService({ db, storage, runRender })
  return { db, svc, storage, dir }
}

// Seed an audio generation row in a chosen status. Mirrors what the generation
// service writes; the film service only reads type/status/id.
function seedAudioGeneration(
  db: ReturnType<typeof createDb>['db'],
  id: string,
  status: 'processing' | 'succeeded' | 'failed',
) {
  db.insert(generation)
    .values({
      id,
      userId: USER,
      type: 'audio',
      mode: 'text',
      status,
      prompt: 'a line',
      modelId: 'voiceover',
      paramsJson: '{}',
      costCredits: 8,
      mediaJson: JSON.stringify([`/media/${id}.mp3`]),
      createdAt: new Date(),
    })
    .run()
}

describe('film audio integrity', () => {
  it('refuses to attach an audio generation that has not succeeded yet', () => {
    const { db, svc } = service()
    const film = svc.createFilm(USER, { title: 'F', aspectRatio: '16:9' })
    seedAudioGeneration(db, 'gen-processing', 'processing')

    // This is the window the UI walked through: TTS still rendering, user clicks
    // "Add voiceover", track lands on the timeline, export runs muted.
    expect(() =>
      svc.addAudio(USER, film.id, { kind: 'voiceover', generationId: 'gen-processing' }),
    ).toThrow(/not ready/i)
  })

  it('refuses to attach a failed audio generation', () => {
    const { db, svc } = service()
    const film = svc.createFilm(USER, { title: 'F', aspectRatio: '16:9' })
    seedAudioGeneration(db, 'gen-failed', 'failed')

    expect(() =>
      svc.addAudio(USER, film.id, { kind: 'music', generationId: 'gen-failed' }),
    ).toThrow(/not ready/i)
  })

  it('attaches a succeeded audio generation', () => {
    const { db, svc } = service()
    const film = svc.createFilm(USER, { title: 'F', aspectRatio: '16:9' })
    seedAudioGeneration(db, 'gen-ok', 'succeeded')

    const track = svc.addAudio(USER, film.id, { kind: 'music', generationId: 'gen-ok' })
    expect(track.generationId).toBe('gen-ok')
  })

  it('fails the render loudly when an attached track has no file on disk', () => {
    const { db, svc } = service()
    const film = svc.createFilm(USER, { title: 'F', aspectRatio: '16:9' })
    svc.addShot(USER, film.id, { title: { text: 'x', position: 'center' }, durationMs: 2000 })
    // Succeeded row, but the asset was never written (pruned, expired, or the
    // save lost a race). The old code shrugged and exported a silent mp4.
    seedAudioGeneration(db, 'gen-no-file', 'succeeded')
    svc.addAudio(USER, film.id, { kind: 'voiceover', generationId: 'gen-no-file' })

    expect(() => svc.createRender(USER, film.id)).toThrow(/audio/i)
  })

  it('renders when the attached track does have its file', async () => {
    const { db, svc, storage } = service()
    const film = svc.createFilm(USER, { title: 'F', aspectRatio: '16:9' })
    svc.addShot(USER, film.id, { title: { text: 'x', position: 'center' }, durationMs: 2000 })
    seedAudioGeneration(db, 'gen-has-file', 'succeeded')
    writeFileSync(storage.localPath('gen-has-file', 'mp3'), 'not really mp3, but it exists')
    svc.addAudio(USER, film.id, { kind: 'voiceover', generationId: 'gen-has-file' })

    const render = svc.createRender(USER, film.id)
    expect(render.status).toBe('processing')
  })
})
