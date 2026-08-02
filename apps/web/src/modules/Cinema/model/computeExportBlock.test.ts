// apps/web/src/modules/Cinema/model/computeExportBlock.test.ts
// The CLIENT-side export validation (the value the retired server `renderBlockReason`
// gave us, moved into the browser): refuse to export a film whose clips aren't ready
// — a shot still generating / failed, an audio track not ready, no renderable shots —
// with the SAME subject-naming reasons, computed from the shots + the generation
// cache. Pure, so every refusal case is pinned with no render.
import { computeExportBlock } from './computeExportBlock'
import type { FilmAudio, Generation, Shot } from '@opencreate/contracts'

const t = (key: string, vars: Record<string, string>) => (vars.subject ? `${key}:${vars.subject}` : key)

function makeShot(overrides: Partial<Shot>): Shot {
  return {
    id: 'a',
    filmId: 'film1',
    orderIndex: 1,
    generationId: 'gen-a',
    prompt: '',
    promptPreset: null,
    entityRefs: [],
    referenceImages: [],
    modelId: null,
    aspectRatio: null,
    durationMs: 4000,
    trimStartMs: 0,
    transition: 'none',
    transitionMs: 0,
    title: null,
    voiceover: null,
    audio: false,
    createdAt: '2026-07-23T10:00:00.000Z',
    ...overrides,
  }
}

function gen(overrides: Partial<Generation>): Generation {
  return {
    id: 'gen-a',
    type: 'video',
    mode: 'text',
    status: 'succeeded',
    prompt: 'x',
    modelId: 'wan-2-7',
    params: {},
    costCredits: 85,
    mediaUrls: ['/media/a.mp4'],
    errorMessage: null,
    createdAt: '2026-07-23T10:00:00.000Z',
    completedAt: '2026-07-23T10:00:30.000Z',
    ...overrides,
  }
}

function makeTrack(overrides: Partial<FilmAudio>): FilmAudio {
  return { id: 't1', filmId: 'film1', kind: 'music', generationId: 'gen-m', shotId: null, startMs: 0, gainDb: 0, ...overrides }
}

describe('computeExportBlock', () => {
  it('blocks an empty film (no renderable shots)', () => {
    const block = computeExportBlock([], [], {}, t)
    expect(block?.message).toBe('cinema.render.blockedReason.film_no_shots')
    expect(block?.subjectKind).toBe('film')
  })

  it('blocks a film whose only shots are empty (no clip, no title)', () => {
    const block = computeExportBlock([makeShot({ id: 'a', generationId: null, title: null })], [], {}, t)
    expect(block?.message).toBe('cinema.render.blockedReason.film_no_shots')
  })

  it('names the shot and says WAIT when its clip is still generating', () => {
    const shots = [makeShot({ id: 'a', generationId: 'gen-a' })]
    const block = computeExportBlock(shots, [], { 'gen-a': gen({ status: 'processing' }) }, t)
    expect(block?.message).toBe('cinema.render.blockedReason.shot_clip_processing:1')
    expect(block?.subjectKind).toBe('shot')
    expect(block?.subjectId).toBe('a')
  })

  it('says REGENERATE when the clip failed — a different reason', () => {
    const shots = [makeShot({ id: 'a', generationId: 'gen-a' })]
    const block = computeExportBlock(shots, [], { 'gen-a': gen({ status: 'failed' }) }, t)
    expect(block?.message).toBe('cinema.render.blockedReason.shot_clip_failed:1')
  })

  it('treats a not-yet-resolved clip as still generating (wait)', () => {
    const shots = [makeShot({ id: 'a', generationId: 'gen-a' })]
    const block = computeExportBlock(shots, [], {}, t) // cache empty → unresolved
    expect(block?.message).toBe('cinema.render.blockedReason.shot_clip_processing:1')
  })

  it('blocks a succeeded-but-audio clip (a video shot must not cite an audio gen)', () => {
    const shots = [makeShot({ id: 'a', generationId: 'gen-a' })]
    const block = computeExportBlock(shots, [], { 'gen-a': gen({ type: 'audio' }) }, t)
    expect(block?.message).toBe('cinema.render.blockedReason.shot_clip_is_audio:1')
  })

  it('names the audio track and says REMOVE when it failed', () => {
    const shots = [makeShot({ id: 'a', generationId: 'gen-a' })]
    const audio = [makeTrack({ id: 't1', generationId: 'gen-m' })]
    const block = computeExportBlock(
      shots,
      audio,
      { 'gen-a': gen({ id: 'gen-a' }), 'gen-m': gen({ id: 'gen-m', type: 'audio', status: 'failed' }) },
      t,
    )
    expect(block?.message).toContain('audio_failed')
    expect(block?.subjectKind).toBe('audio')
    expect(block?.subjectId).toBe('t1')
  })

  it('passes a ready film (all clips + audio succeeded) → null', () => {
    const shots = [makeShot({ id: 'a', generationId: 'gen-a' }), makeShot({ id: 'b', generationId: 'gen-b' })]
    const audio = [makeTrack({ id: 't1', generationId: 'gen-m' })]
    const block = computeExportBlock(
      shots,
      audio,
      {
        'gen-a': gen({ id: 'gen-a', mediaUrls: ['/media/a.mp4'] }),
        'gen-b': gen({ id: 'gen-b', mediaUrls: ['/media/b.mp4'] }),
        'gen-m': gen({ id: 'gen-m', type: 'audio', mediaUrls: ['/media/m.mp3'] }),
      },
      t,
    )
    expect(block).toBeNull()
  })

  it('does not block on a title-card shot (no generation, renders a slate)', () => {
    const shots = [
      makeShot({ id: 'a', generationId: 'gen-a', title: null }),
      makeShot({ id: 'title', generationId: null, title: { text: 'The End', position: 'center' } }),
    ]
    const block = computeExportBlock(shots, [], { 'gen-a': gen({ id: 'gen-a' }) }, t)
    expect(block).toBeNull()
  })
})
