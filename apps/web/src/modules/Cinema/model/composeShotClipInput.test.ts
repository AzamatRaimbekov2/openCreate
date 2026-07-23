// apps/web/src/modules/Cinema/model/composeShotClipInput.test.ts
// The correctness core of CinemaStudio's shot generation: given a timeline Shot
// and a chosen model, the produced POST /api/generations body must be exact —
// structured preset forwarded (never flattened into `prompt`), aspect resolved
// against the film canvas, and video duration snapped to an offered option.
import { describe, expect, it } from 'vitest'
import type { CatalogModel, Shot } from '@opencreate/contracts'
import { composeShotClipInput, nearestDuration } from './composeShotClipInput'

function makeShot(overrides: Partial<Shot> = {}): Shot {
  return {
    id: 'shot1',
    filmId: 'film1',
    orderIndex: 1,
    generationId: null,
    prompt: 'a lighthouse in a storm',
    promptPreset: { styleId: 'cinematic', cameraShot: 'wide', cameraMotion: 'dolly-in' },
    // A shot always carries a cast, even an empty one — the API answers with an
    // array, never null, so a client never has to null-check before mapping it.
    entityRefs: [],
    // Empty until the user attaches reference images to the shot — an array,
    // never null, exactly like entityRefs above.
    referenceImages: [],
    modelId: null,
    durationMs: 6000,
    trimStartMs: 0,
    transition: 'none',
    transitionMs: 0,
    title: null,
    voiceover: null,
    audio: false,
    createdAt: '2026-07-09T10:00:00.000Z',
    ...overrides,
  }
}

const videoModel: CatalogModel = {
  id: 'wan-2-7',
  name: 'Wan 2.7',
  providerLabel: 'Alibaba',
  air: 'wan:2.7@1',
  tier: 'pro',
  type: 'video',
  supportsImageInput: false,
  aspectRatios: ['16:9', '9:16'],
  durationOptions: [5, 10],
  creditsByDuration: { '5': 35, '10': 70 },
}

const imageModel: CatalogModel = {
  id: 'flux-schnell',
  name: 'FLUX schnell',
  providerLabel: 'Black Forest',
  air: 'flux:schnell@1',
  tier: 'fast',
  type: 'image',
  supportsImageInput: false,
  aspectRatios: ['1:1', '16:9'],
  credits: 1,
}

describe('nearestDuration', () => {
  it('snaps to the closest offered option', () => {
    expect(nearestDuration([5, 10], 6)).toBe(5)
    expect(nearestDuration([5, 10], 8)).toBe(10)
    expect(nearestDuration([5], 9)).toBe(5)
  })
})

describe('composeShotClipInput', () => {
  it('forwards the structured preset and snaps duration for a video model', () => {
    const input = composeShotClipInput(makeShot(), videoModel, '16:9')
    expect(input).toEqual({
      modelId: 'wan-2-7',
      prompt: 'a lighthouse in a storm',
      aspectRatio: '16:9',
      promptPreset: { styleId: 'cinematic', cameraShot: 'wide', cameraMotion: 'dolly-in' },
      duration: 5,
    })
  })

  it('never flattens the preset into the prompt (it stays structured)', () => {
    const input = composeShotClipInput(makeShot(), videoModel, '16:9')
    // The prompt is exactly the user's words — no fragment soup (ADR §3)
    expect(input.prompt).toBe('a lighthouse in a storm')
    expect(input.promptPreset).toEqual({
      styleId: 'cinematic',
      cameraShot: 'wide',
      cameraMotion: 'dolly-in',
    })
  })

  it('omits promptPreset entirely when the shot has none', () => {
    const input = composeShotClipInput(makeShot({ promptPreset: null }), videoModel, '16:9')
    expect('promptPreset' in input).toBe(false)
  })

  it('omits duration for an image model', () => {
    const input = composeShotClipInput(makeShot(), imageModel, '1:1')
    expect(input).toEqual({
      modelId: 'flux-schnell',
      prompt: 'a lighthouse in a storm',
      aspectRatio: '1:1',
      promptPreset: { styleId: 'cinematic', cameraShot: 'wide', cameraMotion: 'dolly-in' },
    })
    expect('duration' in input).toBe(false)
  })

  it('falls back to the model first ratio when the film aspect is unsupported', () => {
    // The film is 1:1 but the video model only offers 16:9 / 9:16
    const input = composeShotClipInput(makeShot(), videoModel, '1:1')
    expect(input.aspectRatio).toBe('16:9')
  })

  // THE CAST IS THE FILM. Drop this on the floor and every shot invents a new
  // stranger — which is exactly what a two-shot film did before it existed: two
  // different foxes. The server reads entityRefs to substitute each name into the
  // prompt AND to attach that character's photo as a reference (Wan 2.7's r2v).
  it('forwards the shot cast so the same character carries across shots', () => {
    const cast = [{ placeholder: 'e1', entityId: 'alice' }]
    const input = composeShotClipInput(
      makeShot({ prompt: '[[e1]] walks through snow', entityRefs: cast }),
      videoModel,
      '16:9',
    )
    expect(input.entityRefs).toEqual(cast)
    // The raw token travels UNTOUCHED: the server owns substitution (ADR §3), and
    // a client that pre-resolved it would send fragment soup the row cannot explain.
    expect(input.prompt).toBe('[[e1]] walks through snow')
  })

  // Omitted, not `[]` — an empty array is a claim that the user deliberately cast
  // nobody, and the API's tagging branch keys off a non-empty list.
  it('omits entityRefs entirely when nobody is cast', () => {
    const input = composeShotClipInput(makeShot({ entityRefs: [] }), videoModel, '16:9')
    expect('entityRefs' in input).toBe(false)
  })

  // NATIVE AUDIO IS MONEY. `audio: true` on a model without `nativeAudio` is a
  // 400 by design (the API refuses the capability before charging), and on a
  // 'switchable' model it doubles the price — so the flag travels ONLY when the
  // shot asks AND the model declares the capability.
  it('forwards audio only when the shot asks and the model declares nativeAudio', () => {
    const audioModel = { ...videoModel, nativeAudio: 'switchable' as const }
    const input = composeShotClipInput(makeShot({ audio: true }), audioModel, '16:9')
    expect(input.audio).toBe(true)
  })

  it('drops a stale audio flag when the chosen model has no nativeAudio', () => {
    const input = composeShotClipInput(makeShot({ audio: true }), videoModel, '16:9')
    expect('audio' in input).toBe(false)
  })

  it('sends no audio key for a silent shot even on an audio-capable model', () => {
    const audioModel = { ...videoModel, nativeAudio: 'always' as const }
    const input = composeShotClipInput(makeShot({ audio: false }), audioModel, '16:9')
    expect('audio' in input).toBe(false)
  })
})
