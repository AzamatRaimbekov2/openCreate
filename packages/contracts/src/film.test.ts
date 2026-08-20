// Contract tests for the shot reference-image channel (attach arbitrary images
// to a Cinema shot). The wire promises three things the frontend and the API
// both bind to: a Shot carries a `referenceImages` array of server media paths
// (NEVER data URIs on the read DTO), the upload input accepts only a raster
// image data URI (no svg, capped), and the clip-generation input can never carry
// a raw `referenceImages` data-URI channel (that stays server-only).
import { describe, expect, it } from 'vitest'
import {
  addShotReferenceInputSchema,
  createFilmInputSchema,
  filmSchema,
  generateShotClipInputSchema,
  shotReferenceImageSchema,
  shotSchema,
  splitShotInputSchema,
  updateFilmInputSchema,
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
  aspectRatio: null,
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

// The create dialog collapsed to "title + an optional cover" (owner, 2026-07-31):
// aspect ratio and style moved to the detail page's settings, so the wire has to
// stop demanding them up front. Both changes are WIDENING — every body an older
// client sends still parses — which is the only reason this is safe to ship
// without a version bump.
describe('createFilmInputSchema', () => {
  it('accepts a title alone — the whole dialog is now one field', () => {
    expect(createFilmInputSchema.safeParse({ title: 'Мой фильм' }).success).toBe(true)
  })

  it('still accepts a body carrying aspectRatio and defaultStyleId', () => {
    // The widening must not break the clients already in the wild, nor the
    // from-template path that has always sent a ratio.
    const r = createFilmInputSchema.safeParse({
      title: 'Мой фильм',
      aspectRatio: '9:16',
      defaultStyleId: 'anime',
    })
    expect(r.success).toBe(true)
    expect(r.data?.aspectRatio).toBe('9:16')
  })

  // Optional, NOT defaulted in the schema: the server owns the default so there
  // is one place it is decided, and a client that omits the field cannot be told
  // apart from one that never knew about it.
  it('leaves an omitted aspectRatio undefined for the server to default', () => {
    const r = createFilmInputSchema.safeParse({ title: 'Мой фильм' })
    expect(r.data?.aspectRatio).toBeUndefined()
  })

  it('still rejects a garbage aspectRatio when one IS sent', () => {
    expect(createFilmInputSchema.safeParse({ title: 'X', aspectRatio: '4:3' }).success).toBe(false)
  })

  it('rejects an empty or oversize title', () => {
    expect(createFilmInputSchema.safeParse({ title: '' }).success).toBe(false)
    expect(createFilmInputSchema.safeParse({ title: 'x'.repeat(121) }).success).toBe(false)
  })

  // The cover obeys the SAME rule as every other user-supplied image on the wire.
  // It is the identical guard because it protects the identical thing: bytes we
  // will store and then serve from our own origin.
  it('accepts a raster cover data URI', () => {
    expect(createFilmInputSchema.safeParse({ title: 'X', coverDataUri: PNG }).success).toBe(true)
  })

  it('rejects an svg cover (stored-XSS carrier)', () => {
    const svg = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='
    expect(createFilmInputSchema.safeParse({ title: 'X', coverDataUri: svg }).success).toBe(false)
  })

  it('rejects a URL cover — bytes only, never a fetchable address (SSRF)', () => {
    expect(
      createFilmInputSchema.safeParse({ title: 'X', coverDataUri: 'https://x/y.png' }).success,
    ).toBe(false)
  })

  it('rejects an oversize cover', () => {
    const huge = 'data:image/png;base64,' + 'A'.repeat(14_000_001)
    expect(createFilmInputSchema.safeParse({ title: 'X', coverDataUri: huge }).success).toBe(false)
  })
})

// Editing the cover from the film's settings (owner follow-up, 2026-08-02).
// `coverDataUri` is THREE-VALUED here, which the other patch fields are not, and
// each value has to be distinguishable from the other two:
//   a string  → replace the cover with these bytes
//   null      → remove the cover
//   absent    → leave whatever is there alone
// Collapsing null and absent — the easy mistake — would make every PATCH that
// only renames a film silently wipe its picture.
describe('updateFilmInputSchema.coverDataUri', () => {
  it('accepts a raster data URI — replace the cover', () => {
    const r = updateFilmInputSchema.safeParse({ coverDataUri: PNG })
    expect(r.success).toBe(true)
    expect(r.data?.coverDataUri).toBe(PNG)
  })

  it('accepts null — remove the cover', () => {
    const r = updateFilmInputSchema.safeParse({ coverDataUri: null })
    expect(r.success).toBe(true)
    expect(r.data?.coverDataUri).toBeNull()
  })

  it('distinguishes absent from null — an unrelated patch must not clear it', () => {
    const r = updateFilmInputSchema.safeParse({ title: 'Только переименование' })
    expect(r.success).toBe(true)
    // Not null: the service branches on `!== undefined`, so the two must not
    // arrive as the same value.
    expect(r.data?.coverDataUri).toBeUndefined()
    expect('coverDataUri' in (r.data ?? {})).toBe(false)
  })

  it('applies the same image rule as the create — svg, URLs and oversize refused', () => {
    const svg = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='
    expect(updateFilmInputSchema.safeParse({ coverDataUri: svg }).success).toBe(false)
    expect(updateFilmInputSchema.safeParse({ coverDataUri: 'https://x/y.png' }).success).toBe(false)
    const huge = 'data:image/png;base64,' + 'A'.repeat(14_000_001)
    expect(updateFilmInputSchema.safeParse({ coverDataUri: huge }).success).toBe(false)
  })

  it('still accepts the patch bodies that existed before — widening', () => {
    expect(updateFilmInputSchema.safeParse({}).success).toBe(true)
    expect(
      updateFilmInputSchema.safeParse({
        title: 'Новое имя',
        aspectRatio: '9:16',
        defaultStyleId: null,
      }).success,
    ).toBe(true)
  })
})

describe('filmSchema.coverUrl', () => {
  const baseFilm = {
    id: 'f1',
    title: 'Мой фильм',
    aspectRatio: '16:9' as const,
    defaultStyleId: null,
    templateId: null,
    batchId: null,
    createdAt: '2026-07-31T00:00:00.000Z',
    updatedAt: '2026-07-31T00:00:00.000Z',
  }

  it('carries the stored cover as a server media path', () => {
    const r = filmSchema.safeParse({ ...baseFilm, coverUrl: '/media/abc.png' })
    expect(r.success).toBe(true)
  })

  it('is null for a film with no cover — present and null, never absent', () => {
    expect(filmSchema.safeParse({ ...baseFilm, coverUrl: null }).success).toBe(true)
    // A payload MISSING the key is a server that forgot to fill it. The card
    // renders a placeholder off `coverUrl === null`, so the field has to exist.
    expect(filmSchema.safeParse(baseFilm).success).toBe(false)
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
