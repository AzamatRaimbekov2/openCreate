import { describe, expect, it } from 'vitest'
import {
  addStyleReferenceInputSchema,
  createStyleInputSchema,
  STYLE_MAX_REFERENCES,
  styleReferenceImageSchema,
  styleSchema,
  updateStyleInputSchema,
} from './style'

describe('createStyleInputSchema', () => {
  it('accepts a minimal style — name and fragment are the whole constructor', () => {
    const r = createStyleInputSchema.safeParse({ name: 'Неоновый нуар', fragment: 'neon noir' })
    expect(r.success).toBe(true)
    // The negative always exists; it just defaults to empty, so neither the
    // column nor the DTO ever has to be null.
    expect(r.data?.negative).toBe('')
  })

  it('refuses a style with no fragment — a style IS its fragment', () => {
    expect(createStyleInputSchema.safeParse({ name: 'X', fragment: '' }).success).toBe(false)
    expect(createStyleInputSchema.safeParse({ name: '', fragment: 'neon' }).success).toBe(false)
  })

  it('bounds every field so one row cannot carry a novel', () => {
    const base = { name: 'X', fragment: 'neon' }
    expect(createStyleInputSchema.safeParse({ ...base, name: 'x'.repeat(61) }).success).toBe(false)
    expect(createStyleInputSchema.safeParse({ ...base, fragment: 'x'.repeat(501) }).success).toBe(
      false,
    )
    expect(createStyleInputSchema.safeParse({ ...base, negative: 'x'.repeat(301) }).success).toBe(
      false,
    )
    // …and accepts them exactly at the bound.
    expect(
      createStyleInputSchema.safeParse({
        name: 'x'.repeat(60),
        fragment: 'x'.repeat(500),
        negative: 'x'.repeat(300),
      }).success,
    ).toBe(true)
  })
})

describe('updateStyleInputSchema', () => {
  it('accepts an empty patch and any single field — the editor saves one at a time', () => {
    expect(updateStyleInputSchema.safeParse({}).success).toBe(true)
    expect(updateStyleInputSchema.safeParse({ name: 'Другое имя' }).success).toBe(true)
    expect(updateStyleInputSchema.safeParse({ previewGenerationId: 'gen-1' }).success).toBe(true)
  })

  it('lets the recommended model be CLEARED, not only set', () => {
    const r = updateStyleInputSchema.safeParse({ recommendedModelId: null })
    expect(r.success).toBe(true)
    expect(r.data?.recommendedModelId).toBeNull()
  })

  it('applies the same bounds as create — a patch is not a way around them', () => {
    expect(updateStyleInputSchema.safeParse({ fragment: '' }).success).toBe(false)
    expect(updateStyleInputSchema.safeParse({ fragment: 'x'.repeat(501) }).success).toBe(false)
    expect(updateStyleInputSchema.safeParse({ name: 'x'.repeat(61) }).success).toBe(false)
  })
})

describe('styleSchema', () => {
  it('describes a builtin: no timestamps, no preview, immutable by flag', () => {
    const r = styleSchema.safeParse({
      id: 'anime',
      name: 'Аниме',
      kind: 'prompt',
      builtin: true,
      fragment: 'anime style',
      negative: 'photorealistic',
      recommendedModelId: 'pixverse-v6',
      previewUrl: null,
      referenceImages: [],
      createdAt: null,
      updatedAt: null,
    })
    expect(r.success).toBe(true)
  })

  it('describes a user style with a resolved preview', () => {
    const r = styleSchema.safeParse({
      id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      name: 'Неоновый нуар',
      kind: 'prompt',
      builtin: false,
      fragment: 'neon noir',
      negative: '',
      recommendedModelId: null,
      previewUrl: '/media/abc.webp',
      referenceImages: [{ id: 'r1', url: '/media/ref.png' }],
      createdAt: '2026-07-31T00:00:00.000Z',
      updatedAt: '2026-07-31T00:00:00.000Z',
    })
    expect(r.success).toBe(true)
  })

  // The array is REQUIRED on the wire, like shotSchema.referenceImages: a style
  // that carries nothing sends [], never null, so no picker null-checks before
  // it maps. A payload missing the key is a server that forgot to fill it.
  it('requires the reference array — a package with no images is [], not absent', () => {
    const base = {
      id: 'anime',
      name: 'Аниме',
      kind: 'prompt',
      builtin: true,
      fragment: 'anime style',
      negative: '',
      recommendedModelId: null,
      previewUrl: null,
      createdAt: null,
      updatedAt: null,
    }
    expect(styleSchema.safeParse(base).success).toBe(false)
    expect(styleSchema.safeParse({ ...base, referenceImages: null }).success).toBe(false)
  })
})

// A style is a PACKAGE (ADR style-studio A1): prompt fragments AND up to three
// reference images, together. These are the two shapes that carry the second
// half — the read shape (a path we minted, never bytes) and the upload.
describe('style reference images', () => {
  it('caps a style package at three images', () => {
    expect(STYLE_MAX_REFERENCES).toBe(3)
  })

  it('reads back an id and a server path, never the bytes', () => {
    const r = styleReferenceImageSchema.safeParse({ id: 'r1', url: '/media/abc.png' })
    expect(r.success).toBe(true)
    expect(styleReferenceImageSchema.safeParse({ id: 'r1' }).success).toBe(false)
  })

  it('takes the upload as a single data URI — the same shape a shot reference does', () => {
    expect(addStyleReferenceInputSchema.safeParse({ dataUri: 'data:image/png;base64,iVBOR' }).success).toBe(
      true,
    )
    expect(addStyleReferenceInputSchema.safeParse({ dataUri: '' }).success).toBe(false)
    expect(addStyleReferenceInputSchema.safeParse({}).success).toBe(false)
  })
})
