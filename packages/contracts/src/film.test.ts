// Contract tests for the shot reference-image channel (attach arbitrary images
// to a Cinema shot). The wire promises three things the frontend and the API
// both bind to: a Shot carries a `referenceImages` array of server media paths
// (NEVER data URIs on the read DTO), the upload input accepts only a raster
// image data URI (no svg, capped), and the clip-generation input can never carry
// a raw `referenceImages` data-URI channel (that stays server-only).
import { describe, expect, it } from 'vitest'
import {
  addShotReferenceInputSchema,
  generateShotClipInputSchema,
  shotReferenceImageSchema,
  shotSchema,
  splitShotInputSchema,
  MAX_SHOT_REFERENCE_IMAGES,
} from './film'

const PNG = 'data:image/png;base64,iVBORw0KGgo='

const baseShot = {
  id: 's1',
  filmId: 'f1',
  orderIndex: 1000,
  generationId: null,
  prompt: 'a fox on a beach',
  promptPreset: null,
  entityRefs: [],
  modelId: null,
  durationMs: 3000,
  trimStartMs: 0,
  transition: 'none' as const,
  transitionMs: 0,
  title: null,
  voiceover: null,
  audio: false,
  createdAt: new Date().toISOString(),
}

describe('MAX_SHOT_REFERENCE_IMAGES', () => {
  it('is the max any reference-capable video model accepts today (wan-2-7 r2v = 5)', () => {
    expect(MAX_SHOT_REFERENCE_IMAGES).toBe(5)
  })
})

describe('shotReferenceImageSchema', () => {
  it('is a server media path reference {id,path}, not a data URI', () => {
    const ref = shotReferenceImageSchema.parse({ id: 'r1', path: '/media/abc.png' })
    expect(ref).toEqual({ id: 'r1', path: '/media/abc.png' })
  })
})

describe('shotSchema.referenceImages', () => {
  it('carries an array of {id,path} reference images', () => {
    const shot = shotSchema.parse({
      ...baseShot,
      referenceImages: [{ id: 'r1', path: '/media/abc.png' }],
    })
    expect(shot.referenceImages).toEqual([{ id: 'r1', path: '/media/abc.png' }])
  })

  it('requires referenceImages to be present (an array, never absent — like entityRefs)', () => {
    // The DTO promises an ARRAY; a client must not have to null/undefined-check it.
    expect(shotSchema.safeParse(baseShot).success).toBe(false)
  })
})

describe('addShotReferenceInputSchema', () => {
  it('accepts a single raster image data URI', () => {
    expect(addShotReferenceInputSchema.safeParse({ dataUri: PNG }).success).toBe(true)
  })

  it('rejects an svg data URI (stored-XSS carrier)', () => {
    const svg = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='
    expect(addShotReferenceInputSchema.safeParse({ dataUri: svg }).success).toBe(false)
  })

  it('rejects a non-image data URI / bare URL (SSRF: no URLs)', () => {
    expect(addShotReferenceInputSchema.safeParse({ dataUri: 'https://x/y.png' }).success).toBe(false)
    expect(addShotReferenceInputSchema.safeParse({ dataUri: 'data:text/plain;base64,aGk=' }).success).toBe(false)
  })

  it('rejects an oversize payload (cap mirrors the entity image ~14MB limit)', () => {
    const huge = 'data:image/png;base64,' + 'A'.repeat(14_000_001)
    expect(addShotReferenceInputSchema.safeParse({ dataUri: huge }).success).toBe(false)
  })
})

describe('splitShotInputSchema', () => {
  it('accepts a positive integer millisecond offset', () => {
    expect(splitShotInputSchema.safeParse({ atMs: 1500 }).success).toBe(true)
  })

  it('rejects a non-positive offset (the wire lower bound; upper bound is a service rule)', () => {
    expect(splitShotInputSchema.safeParse({ atMs: 0 }).success).toBe(false)
    expect(splitShotInputSchema.safeParse({ atMs: -1 }).success).toBe(false)
  })

  it('rejects a fractional offset — ms are integers', () => {
    expect(splitShotInputSchema.safeParse({ atMs: 12.5 }).success).toBe(false)
  })

  it('requires atMs', () => {
    expect(splitShotInputSchema.safeParse({}).success).toBe(false)
  })
})

describe('generateShotClipInputSchema', () => {
  it('accepts the shot cast up to MAX_SHOT_REFERENCE_IMAGES (wire /generations caps at 1)', () => {
    const refs = Array.from({ length: MAX_SHOT_REFERENCE_IMAGES }, (_, i) => ({
      placeholder: `e${i + 1}`,
      entityId: `ent${i + 1}`,
    }))
    expect(
      generateShotClipInputSchema.safeParse({ modelId: 'wan-2-7', prompt: 'hello', entityRefs: refs }).success,
    ).toBe(true)
  })

  it('rejects more than MAX_SHOT_REFERENCE_IMAGES entity refs', () => {
    const refs = Array.from({ length: MAX_SHOT_REFERENCE_IMAGES + 1 }, (_, i) => ({
      placeholder: `e${i + 1}`,
      entityId: `ent${i + 1}`,
    }))
    expect(
      generateShotClipInputSchema.safeParse({ modelId: 'wan-2-7', prompt: 'hello', entityRefs: refs }).success,
    ).toBe(false)
  })

  it('STRIPS any client-supplied referenceImages — the raw data-URI channel is server-only', () => {
    const parsed = generateShotClipInputSchema.parse({
      modelId: 'wan-2-7',
      prompt: 'hello',
      // A client trying to inject reference-image BYTES directly.
      referenceImages: [PNG],
    })
    expect('referenceImages' in parsed).toBe(false)
  })
})
