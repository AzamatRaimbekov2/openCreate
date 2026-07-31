import { describe, expect, it } from 'vitest'
import {
  applyPromptPreset,
  builtinStyleIdSchema,
  promptPresetSchema,
  resolveBuiltinStyle,
  styleIdSchema,
  STYLE_PRESETS,
} from './presets'

describe('applyPromptPreset', () => {
  it('returns exactly the user prompt when no preset is given (additive default)', () => {
    const r = applyPromptPreset('a red fox in the snow')
    expect(r.positivePrompt).toBe('a red fox in the snow')
    expect(r.negativePrompt).toBe('')
  })

  it('composes style, shot, motion, quality, then the user text LAST, in that order', () => {
    const r = applyPromptPreset(
      'аня смотрит на закат',
      {
        styleId: 'disney',
        cameraShot: 'close-up',
        cameraMotion: 'dolly-in',
        quality: 'cinematic',
      },
      resolveBuiltinStyle('disney')!,
    )
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
    const r = applyPromptPreset('a knight', { styleId: 'anime' }, resolveBuiltinStyle('anime')!)
    expect(r.negativePrompt).toBe(STYLE_PRESETS.anime.negative)
    // a preset with no style contributes no negative
    expect(applyPromptPreset('a knight', { cameraShot: 'wide' }).negativePrompt).toBe('')
  })

  // The hazard the parameterization introduces, pinned so it stays a KNOWN
  // shape: fragments come only from the resolved style, so an id nobody
  // resolved contributes nothing rather than leaking the bare id into the
  // prompt. Callers that charge money must refuse first — see the
  // "unknown style" guard in the generations service.
  it('ignores a styleId whose fragments were never resolved', () => {
    const r = applyPromptPreset('a knight', { styleId: 'anime' })
    expect(r.positivePrompt).toBe('a knight')
    expect(r.negativePrompt).toBe('')
  })

  // A user style is just two strings by the time it reaches here — the whole
  // point of ADR style-studio D3.
  it('applies fragments that belong to no builtin table at all', () => {
    const r = applyPromptPreset('a knight', { styleId: 'a-uuid' }, {
      fragment: 'neon noir, wet asphalt reflections',
      negative: 'daylight',
    })
    expect(r.positivePrompt).toBe('neon noir, wet asphalt reflections, a knight')
    expect(r.negativePrompt).toBe('daylight')
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
    const r = applyPromptPreset(
      '  a castle  ',
      { styleId: 'cinematic' },
      resolveBuiltinStyle('cinematic')!,
    )
    expect(r.positivePrompt.endsWith('a castle')).toBe(true)
  })

  it('composes to the fragment alone when the user prompt is empty', () => {
    const r = applyPromptPreset('', { styleId: '2d-cartoon' }, resolveBuiltinStyle('2d-cartoon')!)
    expect(r.positivePrompt).toBe(STYLE_PRESETS['2d-cartoon'].fragment)
  })
})

describe('resolveBuiltinStyle', () => {
  it('resolves every builtin id to its own preset', () => {
    for (const id of builtinStyleIdSchema.options) {
      expect(resolveBuiltinStyle(id)).toBe(STYLE_PRESETS[id])
    }
  })

  it('answers null for an id that is not builtin — the registry then tries the user rows', () => {
    expect(resolveBuiltinStyle('ghibli')).toBeNull()
    expect(resolveBuiltinStyle('7c9e6679-7425-40de-944b-e07fc1f90ae7')).toBeNull()
  })

  // Object.hasOwn, not `id in STYLE_PRESETS`: a plain object literal inherits
  // from Object.prototype, so 'constructor' and 'toString' would otherwise
  // resolve to functions and be handed to the composer as a style.
  it('does not resolve inherited Object properties', () => {
    expect(resolveBuiltinStyle('constructor')).toBeNull()
    expect(resolveBuiltinStyle('toString')).toBeNull()
    expect(resolveBuiltinStyle('__proto__')).toBeNull()
  })
})

// The bytes a builtin style composed to BEFORE styleId opened into a free
// string and the fragments became a parameter. Literal on purpose: asserting
// against STYLE_PRESETS.anime.fragment would move with any edit to the table
// and could never catch the thing this pins — that routing a builtin id
// through the registry still produces the identical prompt.
describe('builtin composition is frozen', () => {
  it("composes 'anime' to the exact pre-registry bytes", () => {
    const r = applyPromptPreset('a knight', { styleId: 'anime' }, resolveBuiltinStyle('anime')!)
    expect(r.positivePrompt).toBe(
      'anime style, cel-shaded, clean line art, vibrant saturated colors, detailed backgrounds, Japanese animation aesthetic, a knight',
    )
    expect(r.negativePrompt).toBe('photorealistic, 3d render, western cartoon, low quality')
  })

  it("composes 'cinematic' with the modifier axes to the exact pre-registry bytes", () => {
    const r = applyPromptPreset(
      'a knight',
      { styleId: 'cinematic', cameraShot: 'wide', quality: 'ultra' },
      resolveBuiltinStyle('cinematic')!,
    )
    expect(r.positivePrompt).toBe(
      'cinematic live-action style, photorealistic, dramatic lighting, shallow depth of field, film grain, professional color grading, wide establishing shot, ultra detailed, 8k, masterpiece, best quality, intricate detail, a knight',
    )
    expect(r.negativePrompt).toBe('cartoon, anime, illustration, low quality, deformed')
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
  // THE CONTRACT CHANGE (ADR style-studio D1). The wire no longer decides which
  // styles exist — an id it has never heard of may well be a style the caller
  // built five seconds ago. What the schema still owns is SHAPE; the server owns
  // existence, and refuses an id it cannot resolve before it charges (see
  // generations-styles.test.ts).
  it('accepts an id the enum never knew — a user style is a uuid', () => {
    expect(
      promptPresetSchema.safeParse({ styleId: '7c9e6679-7425-40de-944b-e07fc1f90ae7' }).success,
    ).toBe(true)
  })

  it('still accepts every builtin id — the change is widening only', () => {
    for (const id of builtinStyleIdSchema.options) {
      expect(promptPresetSchema.safeParse({ styleId: id }).success).toBe(true)
    }
  })

  it('rejects an empty or oversize style id — shape is still the schema’s job', () => {
    expect(promptPresetSchema.safeParse({ styleId: '' }).success).toBe(false)
    expect(promptPresetSchema.safeParse({ styleId: 'x'.repeat(61) }).success).toBe(false)
    expect(styleIdSchema.safeParse('x'.repeat(60)).success).toBe(true)
  })
})
