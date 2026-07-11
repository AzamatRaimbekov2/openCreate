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
    modelId: null,
    durationMs: 6000,
    trimStartMs: 0,
    transition: 'none',
    transitionMs: 0,
    title: null,
    voiceover: null,
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
})
