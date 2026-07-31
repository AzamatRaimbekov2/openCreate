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
  // REPLACES the previous "refuses to attach a not-succeeded generation" test
  // (owner-approved 2026-07-20). That guard was the SECOND of two, and it is the
  // one that broke the client: audio generations are async (they return 202
  // `processing`), so the UI's create-then-attach flow could never satisfy it and
  // voiceover/music attachment failed 100% of the time AFTER charging the user.
  //
  // Attaching a still-processing track is now legal and matches how SHOTS already
  // work (a shot cites a processing generation and shows live status). The
  // property that actually matters — audio must never be silently missing from an
  // export — is held by buildPlan, exercised by the three tests below.
  it('attaches an audio generation that is still processing', async () => {
    const { db, svc } = service()
    const film = await svc.createFilm(USER, { title: 'F', aspectRatio: '16:9' })
    seedAudioGeneration(db, 'gen-processing', 'processing')

    const track = svc.addAudio(USER, film.id, {
      kind: 'voiceover',
      generationId: 'gen-processing',
    })

    expect(track.generationId).toBe('gen-processing')
  })

  it('still refuses to attach a generation that is not audio', async () => {
    // The type + ownership checks are NOT relaxed — mixing a video file as an
    // audio track would break the mux, and that has nothing to do with timing.
    const { db, svc } = service()
    const film = await svc.createFilm(USER, { title: 'F', aspectRatio: '16:9' })
    db.insert(generation)
      .values({
        id: 'gen-video',
        userId: USER,
        type: 'video',
        mode: 'text',
        status: 'succeeded',
        prompt: 'a clip',
        modelId: 'wan-2-7',
        paramsJson: '{}',
        costCredits: 40,
        mediaJson: JSON.stringify(['/media/gen-video.mp4']),
        createdAt: new Date(),
      })
      .run()

    expect(() =>
      svc.addAudio(USER, film.id, { kind: 'music', generationId: 'gen-video' }),
    ).toThrow(/not an audio generation/i)
  })

  it('refuses to RENDER while an attached track is still processing', async () => {
    // buildPlan is now the SINGLE enforcement point. A pending track may sit on
    // the timeline, but it may never reach a finished mp4 as silence — the export
    // stops with a message the user can act on.
    const { db, svc } = service()
    const film = await svc.createFilm(USER, { title: 'F', aspectRatio: '16:9' })
    svc.addShot(USER, film.id, { title: { text: 'x', position: 'center' }, durationMs: 2000 })
    seedAudioGeneration(db, 'gen-pending', 'processing')
    svc.addAudio(USER, film.id, { kind: 'voiceover', generationId: 'gen-pending' })

    // Asserted on the REASON, not the prose: the message is user-facing copy and
    // is allowed to be rewritten, but the machine-readable cause is the contract.
    // (It said "not ready" until 2026-07-21, when the vague single sentence was
    // split into one instruction per cause — see films-render-reasons.test.ts.)
    expect(() => svc.createRender(USER, film.id)).toThrow(
      expect.objectContaining({ reason: 'audio_processing' }),
    )
  })

  it('refuses to RENDER when an attached track failed', async () => {
    const { db, svc } = service()
    const film = await svc.createFilm(USER, { title: 'F', aspectRatio: '16:9' })
    svc.addShot(USER, film.id, { title: { text: 'x', position: 'center' }, durationMs: 2000 })
    seedAudioGeneration(db, 'gen-failed', 'failed')
    svc.addAudio(USER, film.id, { kind: 'music', generationId: 'gen-failed' })

    // A DIFFERENT reason from the processing case above — that separation is the
    // whole point: "wait" and "remove" cannot be the same sentence.
    expect(() => svc.createRender(USER, film.id)).toThrow(
      expect.objectContaining({ reason: 'audio_failed' }),
    )
  })

  it('attaches a succeeded audio generation', async () => {
    const { db, svc } = service()
    const film = await svc.createFilm(USER, { title: 'F', aspectRatio: '16:9' })
    seedAudioGeneration(db, 'gen-ok', 'succeeded')

    const track = svc.addAudio(USER, film.id, { kind: 'music', generationId: 'gen-ok' })
    expect(track.generationId).toBe('gen-ok')
  })

  it('fails the render loudly when an attached track has no file on disk', async () => {
    const { db, svc } = service()
    const film = await svc.createFilm(USER, { title: 'F', aspectRatio: '16:9' })
    svc.addShot(USER, film.id, { title: { text: 'x', position: 'center' }, durationMs: 2000 })
    // Succeeded row, but the asset was never written (pruned, expired, or the
    // save lost a race). The old code shrugged and exported a silent mp4.
    seedAudioGeneration(db, 'gen-no-file', 'succeeded')
    svc.addAudio(USER, film.id, { kind: 'voiceover', generationId: 'gen-no-file' })

    expect(() => svc.createRender(USER, film.id)).toThrow(/audio/i)
  })

  it('renders when the attached track does have its file', async () => {
    const { db, svc, storage } = service()
    const film = await svc.createFilm(USER, { title: 'F', aspectRatio: '16:9' })
    svc.addShot(USER, film.id, { title: { text: 'x', position: 'center' }, durationMs: 2000 })
    seedAudioGeneration(db, 'gen-has-file', 'succeeded')
    writeFileSync(storage.localPath('gen-has-file', 'mp3'), 'not really mp3, but it exists')
    svc.addAudio(USER, film.id, { kind: 'voiceover', generationId: 'gen-has-file' })

    const render = svc.createRender(USER, film.id)
    expect(render.status).toBe('processing')
  })
})
