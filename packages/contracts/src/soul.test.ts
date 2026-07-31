// packages/contracts/src/soul.test.ts
// The composer is the correctness core of Soul Studio: if it is wrong, the user
// builds a one-eyed cyborg, pays 26 credits, and receives a stranger with two
// eyes — silently. These tests pin the properties that failure would break.
import { describe, expect, it } from 'vitest'
import {
  MAX_TRAITS,
  PORTRAIT_SHEET_VIEWS,
  PORTRAIT_VIEWS,
  PROMPT_LIBRARY,
  TRAITS,
  TRAIT_GROUPS,
  composePortraitPrompt,
  composeSoul,
  soulPromptPreset,
  soulSchema,
} from './soul'
import type { Soul } from './soul'
import { applyPromptPreset, resolveBuiltinStyle } from './presets'

// The minimum a soul can be: the two required axes and nothing else.
const bare: Soul = { archetype: 'female', styleId: 'anime', traits: [], notes: '' }

describe('composeSoul', () => {
  it('composes the archetype alone when nothing else is picked', () => {
    expect(composeSoul(bare)).toBe('a woman')
  })

  it('never emits a dangling comma for an unset axis', () => {
    const text = composeSoul({ ...bare, build: 'slim' })
    expect(text).toBe('a woman, slim, lean build')
    expect(text).not.toMatch(/,\s*,/)
    expect(text).not.toMatch(/,\s*$/)
  })

  it('joins hair colour and style into ONE phrase, not two competing ones', () => {
    // "platinum blonde, long flowing hair" would weight hair twice in the text
    // encoder and blur it. One phrase, one concept.
    expect(composeSoul({ ...bare, hairColor: 'blonde', hairStyle: 'long' })).toBe(
      'a woman, platinum blonde long flowing hair',
    )
  })

  it('supplies the noun when only a hair colour is picked', () => {
    expect(composeSoul({ ...bare, hairColor: 'red' })).toBe('a woman, fiery red hair')
  })

  it('uses the style alone when no colour is picked', () => {
    expect(composeSoul({ ...bare, hairStyle: 'mohawk' })).toBe(
      'a woman, shaved sides with a tall mohawk',
    )
  })

  it('keeps a fixed fragment order regardless of key order in the object', () => {
    // The entity description is DERIVED from this string. If it reshuffled, every
    // save would produce a spurious diff and no two runs would be comparable.
    const a = composeSoul({ ...bare, vibe: 'stoic', outfit: 'armor', age: 'adult' })
    const b = composeSoul({ ...bare, age: 'adult', outfit: 'armor', vibe: 'stoic' })
    expect(a).toBe(b)
    expect(a).toBe(
      'a woman, in their thirties, battle-worn plate armor, stoic, unreadable expression',
    )
  })

  it('places traits before the outfit — a missing eye is part of the person', () => {
    const text = composeSoul({ ...bare, traits: ['missing-eye'], outfit: 'suit' })
    expect(text.indexOf('empty scarred socket')).toBeLessThan(text.indexOf('business suit'))
  })

  it('appends notes verbatim, last', () => {
    expect(composeSoul({ ...bare, notes: '  holding a cracked pocket watch  ' })).toBe(
      'a woman, holding a cracked pocket watch',
    )
  })

  it('carries every requested trait into the prompt', () => {
    const soul: Soul = { ...bare, traits: ['iron-arm', 'horns', 'facial-scar'] }
    const text = composeSoul(soul)
    for (const id of soul.traits) expect(text).toContain(TRAITS[id].fragment)
  })

  // The cap is a property of the COMPOSITION, not just of the parser: a Soul
  // literal built in code (a PROMPT_LIBRARY entry, a template) must not be able
  // to smuggle in a seventh trait that the encoder would silently drop anyway.
  it('never emits more than MAX_TRAITS traits, even from a hand-built object', () => {
    const overfull = {
      ...bare,
      traits: ['horns', 'wings', 'tail', 'fangs', 'claws', 'gills', 'third-eye'],
    } as Soul
    const text = composeSoul(overfull)
    expect(text).not.toContain(TRAITS['third-eye'].fragment)
  })

  it('rejects a seventh trait at the schema boundary', () => {
    const result = soulSchema.safeParse({
      archetype: 'male',
      styleId: 'comic',
      traits: ['horns', 'wings', 'tail', 'fangs', 'claws', 'gills', 'third-eye'],
    })
    expect(result.success).toBe(false)
  })

  it('defaults traits and notes so a minimal payload parses', () => {
    const result = soulSchema.safeParse({ archetype: 'robot', styleId: 'cinematic' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.traits).toEqual([])
      expect(result.data.notes).toBe('')
    }
  })
})

describe('composeSoul — what it deliberately does NOT contain', () => {
  // The style is a PRESET axis: it owns a negative prompt, and the description
  // derived from this text gets tagged into OTHER scenes with other styles.
  // Baking "anime style" in here would fight the scene's own style and would
  // silently drop the style's negative half.
  it('omits the style fragment — that belongs to the preset', () => {
    expect(composeSoul({ ...bare, styleId: 'disney' })).not.toMatch(/disney|pixar|3d animated/i)
  })

  it('omits the reference-sheet framing — that belongs to the preset too', () => {
    expect(composeSoul(bare)).not.toMatch(/background|lighting|reference sheet/i)
  })
})

describe('composePortraitPrompt', () => {
  it('puts the view fragment last, after the model knows who it is drawing', () => {
    const prompt = composePortraitPrompt(bare, 'profile')
    expect(prompt).toBe('a woman, strict side profile view, head and shoulders')
    expect(prompt.endsWith(PORTRAIT_VIEWS.profile.fragment)).toBe(true)
  })

  it('produces a distinct prompt for every sheet view', () => {
    const prompts = PORTRAIT_SHEET_VIEWS.map((view) => composePortraitPrompt(bare, view))
    expect(new Set(prompts).size).toBe(PORTRAIT_SHEET_VIEWS.length)
  })

  it('frames the full-body view in portrait, the head shots square', () => {
    // A full-body shot in a square frame spends half its pixels on background.
    expect(PORTRAIT_VIEWS['full-body'].aspect).toBe('9:16')
    expect(PORTRAIT_VIEWS.front.aspect).toBe('1:1')
  })
})

describe('soulPromptPreset — the negatives that make a sheet clean', () => {
  it('carries BOTH the style negative and the framing negative', () => {
    // The regression this pins: assigning instead of joining negatives silently
    // dropped one of them, and a Disney sheet stopped pushing away
    // "photorealistic" the moment it started pushing away "busy background".
    const { negativePrompt } = applyPromptPreset(
      composePortraitPrompt({ ...bare, styleId: 'disney' }, 'front'),
      soulPromptPreset({ ...bare, styleId: 'disney' }),
      // A soul's style axis is builtin-only (see soulSchema), so the caller
      // resolves it straight out of the table the pills are rendered from.
      resolveBuiltinStyle('disney')!,
    )
    expect(negativePrompt).toContain('photorealistic') // style's
    expect(negativePrompt).toContain('multiple characters') // framing's
    expect(negativePrompt).toContain('watermark')
  })

  it('puts the style and the framing into the positive prompt', () => {
    const soul: Soul = { ...bare, styleId: 'comic', traits: ['horns'] }
    const { positivePrompt } = applyPromptPreset(
      composePortraitPrompt(soul, 'front'),
      soulPromptPreset(soul),
      resolveBuiltinStyle(soul.styleId)!,
    )
    expect(positivePrompt).toContain('comic book art style')
    expect(positivePrompt).toContain('plain neutral seamless studio background')
    expect(positivePrompt).toContain('a pair of curved horns')
    expect(positivePrompt).toContain('front view')
  })
})

describe('the tables themselves', () => {
  it('groups every trait exactly once — the picker cannot hide one', () => {
    const grouped = TRAIT_GROUPS.flatMap((group) => group.traits)
    expect([...grouped].sort()).toEqual(Object.keys(TRAITS).sort())
    expect(new Set(grouped).size).toBe(grouped.length)
  })

  it('ships a prompt library whose every entry is a VALID soul', () => {
    // Each library entry is a Soul literal, not a string — that is what lets the
    // UI offer both "Copy prompt" and "Open in constructor". A malformed literal
    // would only surface when a user clicked it.
    for (const entry of PROMPT_LIBRARY) {
      const result = soulSchema.safeParse(entry.soul)
      expect(result.success, `${entry.id} is not a valid soul`).toBe(true)
      expect(entry.soul.traits.length).toBeLessThanOrEqual(MAX_TRAITS)
      expect(composeSoul(entry.soul).length).toBeGreaterThan(10)
    }
  })

  it('gives every library entry a unique id', () => {
    const ids = PROMPT_LIBRARY.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
