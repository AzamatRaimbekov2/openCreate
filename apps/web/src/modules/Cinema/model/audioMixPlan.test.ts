// apps/web/src/modules/Cinema/model/audioMixPlan.test.ts
// The audio half of the export spec (render.ts §"Audio"): each clip's NATIVE
// soundtrack (a shot generated with sound) delayed to its crossfade-aware timeline
// start, plus the film's music/voiceover tracks at their offset with gain. Pure —
// the OfflineAudioContext mix in the browser consumes this list.
import { audioMixPlan } from './audioMixPlan'
import type { FilmAudio, Shot } from '@opencreate/contracts'

function makeShot(overrides: Partial<Shot>): Shot {
  return {
    id: 'shot1',
    filmId: 'film1',
    orderIndex: 1,
    generationId: 'gen1',
    prompt: '',
    promptPreset: null,
    entityRefs: [],
    referenceImages: [],
    modelId: null,
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

function makeTrack(overrides: Partial<FilmAudio>): FilmAudio {
  return {
    id: 'a1',
    filmId: 'film1',
    kind: 'music',
    generationId: 'gen-audio',
    shotId: null,
    startMs: 0,
    gainDb: 0,
    ...overrides,
  }
}

describe('audioMixPlan', () => {
  it('emits no native source for a silent shot', () => {
    const plan = audioMixPlan([makeShot({ id: 'a', audio: false })], [])
    expect(plan.sources).toEqual([])
    expect(plan.totalMs).toBe(4000)
  })

  it('delays a clip native soundtrack to its timeline start, trimmed to the window', () => {
    const plan = audioMixPlan(
      [
        makeShot({ id: 'a', durationMs: 4000 }),
        makeShot({ id: 'b', generationId: 'gen-b', durationMs: 6000, trimStartMs: 500, audio: true }),
      ],
      [],
    )
    expect(plan.sources).toEqual([
      {
        kind: 'native',
        generationId: 'gen-b',
        timelineStartMs: 4000, // b starts after a (hard cut)
        sourceStartMs: 500, // the shot's trim window
        durationMs: 6000,
        gainDb: 0,
      },
    ])
  })

  it('starts a native soundtrack EARLIER when the shot crossfades in', () => {
    const plan = audioMixPlan(
      [
        makeShot({ id: 'a', durationMs: 4000 }),
        makeShot({ id: 'b', generationId: 'gen-b', durationMs: 6000, transition: 'crossfade', transitionMs: 1000, audio: true }),
      ],
      [],
    )
    // b (and its sound) starts 1000ms before a ends — same overlap the picture has.
    expect(plan.sources[0]?.timelineStartMs).toBe(3000)
  })

  it('places film tracks at their offset with gain, natural length (null)', () => {
    const plan = audioMixPlan(
      [makeShot({ id: 'a', durationMs: 4000 })],
      [
        makeTrack({ id: 'm', kind: 'music', generationId: 'gen-music', startMs: 0, gainDb: -6 }),
        makeTrack({ id: 'v', kind: 'voiceover', generationId: 'gen-voice', shotId: 'a', startMs: 1000, gainDb: 0 }),
      ],
    )
    expect(plan.sources).toContainEqual({
      kind: 'music',
      generationId: 'gen-music',
      timelineStartMs: 0,
      sourceStartMs: 0,
      durationMs: null,
      gainDb: -6,
    })
    expect(plan.sources).toContainEqual({
      kind: 'voiceover',
      generationId: 'gen-voice',
      timelineStartMs: 1000,
      sourceStartMs: 0,
      durationMs: null,
      gainDb: 0,
    })
  })

  it('keeps a track that starts past the film end — the mixer caps to totalMs', () => {
    const plan = audioMixPlan(
      [makeShot({ id: 'a', durationMs: 4000 })],
      [makeTrack({ id: 'm', generationId: 'gen-music', startMs: 9000 })],
    )
    expect(plan.totalMs).toBe(4000)
    expect(plan.sources).toHaveLength(1)
    expect(plan.sources[0]?.timelineStartMs).toBe(9000)
  })
})
