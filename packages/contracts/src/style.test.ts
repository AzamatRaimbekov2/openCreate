import { describe, expect, it } from 'vitest'
import { createStyleInputSchema, styleSchema, updateStyleInputSchema } from './style'

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
      createdAt: '2026-07-31T00:00:00.000Z',
      updatedAt: '2026-07-31T00:00:00.000Z',
    })
    expect(r.success).toBe(true)
  })
})
