import { describe, expect, it } from 'vitest'
import { applyPromptPreset, promptPresetSchema, STYLE_PRESETS } from './presets'

describe('applyPromptPreset', () => {
  it('returns exactly the user prompt when no preset is given (additive default)', () => {
    const r = applyPromptPreset('a red fox in the snow')
    expect(r.positivePrompt).toBe('a red fox in the snow')
    expect(r.negativePrompt).toBe('')
  })

  it('composes style, shot, motion, quality, then the user text LAST, in that order', () => {
    const r = applyPromptPreset('аня смотрит на закат', {
      styleId: 'disney',
      cameraShot: 'close-up',
      cameraMotion: 'dolly-in',
      quality: 'cinematic',
    })
    // Fragments themselves contain ", " so we assert on positions, not on split.
    // Style fragment leads, user text is dead last.
    expect(r.positivePrompt.startsWith(STYLE_PRESETS.disney.fragment)).toBe(true)
    expect(r.positivePrompt.endsWith('аня смотрит на закат')).toBe(true)
    // The four axes appear in the fixed order: style < shot < motion < quality < user text.
    const iStyle = r.positivePrompt.indexOf(STYLE_PRESETS.disney.fragment)
    const iShot = r.positivePrompt.indexOf('close-up shot')
    const iMotion = r.positivePrompt.indexOf('slow dolly in')
    const iQuality = r.positivePrompt.indexOf('cinematic quality')
    const iUser = r.positivePrompt.indexOf('аня смотрит на закат')
    expect(iStyle).toBeGreaterThanOrEqual(0)
    expect(iShot).toBeGreaterThan(iStyle)
    expect(iMotion).toBeGreaterThan(iShot)
    expect(iQuality).toBeGreaterThan(iMotion)
    expect(iUser).toBeGreaterThan(iQuality)
  })

  it('pulls the negative prompt from the style only', () => {
    const r = applyPromptPreset('a knight', { styleId: 'anime' })
    expect(r.negativePrompt).toBe(STYLE_PRESETS.anime.negative)
    // a preset with no style contributes no negative
    expect(applyPromptPreset('a knight', { cameraShot: 'wide' }).negativePrompt).toBe('')
  })

  it("drops empty 'none' fragments — no dangling commas", () => {
    const r = applyPromptPreset('a castle', {
      cameraShot: 'none',
      cameraMotion: 'none',
      quality: 'none',
    })
    expect(r.positivePrompt).toBe('a castle')
    expect(r.positivePrompt).not.toContain(', ,')
    expect(r.positivePrompt.startsWith(',')).toBe(false)
  })

  it('trims the user prompt so it never introduces stray whitespace', () => {
    const r = applyPromptPreset('  a castle  ', { styleId: 'cinematic' })
    expect(r.positivePrompt.endsWith('a castle')).toBe(true)
  })

  it('composes to the fragment alone when the user prompt is empty', () => {
    const r = applyPromptPreset('', { styleId: '2d-cartoon' })
    expect(r.positivePrompt).toBe(STYLE_PRESETS['2d-cartoon'].fragment)
  })
})

describe('promptPresetSchema', () => {
  it('accepts an empty object (every field optional)', () => {
    expect(promptPresetSchema.safeParse({}).success).toBe(true)
  })
  it('accepts a full valid preset', () => {
    const r = promptPresetSchema.safeParse({
      styleId: 'disney',
      cameraShot: 'aerial',
      cameraMotion: 'orbit',
      quality: 'ultra',
    })
    expect(r.success).toBe(true)
  })
  it('rejects an unknown style id', () => {
    expect(promptPresetSchema.safeParse({ styleId: 'ghibli' }).success).toBe(false)
  })
})
