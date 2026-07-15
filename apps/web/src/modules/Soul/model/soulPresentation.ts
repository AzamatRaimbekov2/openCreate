// apps/web/src/modules/Soul/model/soulPresentation.ts
// How a Soul is SHOWN — twice, to two different readers:
//
//   · to the MODEL — `composeSoulPreview`, the exact prompt the server will
//     submit for the hero portrait. The web NEVER concatenates fragments (ADR
//     §2): it calls the contract composers and prints the result. That is the
//     whole point of the live preview — the user reads what the model will read,
//     not an approximation of it.
//
//   · to the HUMAN — `soulFacts` / `soulTraitLabels`, the picked options as
//     their LABELS. A soul card must show "Существо · Комикс · Рога", not the
//     English fragment soup the encoder gets; the character sheet is for the
//     person who built the character.
//
// Both are pure, so both are provable without a network (soulPresentation.test.ts).
import {
  ARCHETYPES,
  AGES,
  BUILDS,
  EYE_COLORS,
  HAIR_COLORS,
  HAIR_STYLES,
  MAX_TRAITS,
  OUTFITS,
  PORTRAIT_SHEET_VIEWS,
  SKINS,
  STYLE_PRESETS,
  TRAITS,
  VIBES,
  applyPromptPreset,
  composePortraitPrompt,
  soulPromptPreset,
} from '@opencreate/contracts'
import type { ComposedPrompt, Soul } from '@opencreate/contracts'

// The hero shot — the first view of the sheet, and the one the constructor
// previews. Derived from the contract array rather than written as 'front', so
// reordering the sheet there also moves the preview here.
const PREVIEW_VIEW = PORTRAIT_SHEET_VIEWS[0]

// What the model will actually see for the first portrait: the subject
// (composeSoul → composePortraitPrompt) wrapped in the soul's preset — its style
// AND the reference-sheet framing, which is where the "clean, one character,
// plain background" negative lives. Composing it here with the SAME two contract
// functions the API calls is what makes the preview honest.
export function composeSoulPreview(soul: Soul): ComposedPrompt {
  return applyPromptPreset(composePortraitPrompt(soul, PREVIEW_VIEW), soulPromptPreset(soul))
}

// The single-select axes, in the order a character sheet reads best. `traits`
// and `notes` are NOT here: traits are a chip list (soulTraitLabels) and notes
// are free prose — both render differently, so folding them into a key/value row
// would only force the component to special-case them back out.
export type SoulAxis =
  | 'archetype'
  | 'style'
  | 'age'
  | 'build'
  | 'hairColor'
  | 'hairStyle'
  | 'eyeColor'
  | 'skin'
  | 'outfit'
  | 'vibe'

export type SoulFact = {
  // The axis name — the COMPONENT localizes it (soul.axis.*); this stays i18n-free
  axis: SoulAxis
  // The picked option's label, straight from the contract table (already Russian,
  // same convention as STYLE_PRESETS — deliberately not routed through i18n)
  value: string
}

// Only the axes the user actually picked. An unset axis contributes nothing to
// the prompt, so printing it as "Возраст: —" would be a row of noise claiming a
// choice was made.
export function soulFacts(soul: Soul): SoulFact[] {
  const facts: SoulFact[] = [
    { axis: 'archetype', value: ARCHETYPES[soul.archetype].label },
    { axis: 'style', value: STYLE_PRESETS[soul.styleId].label },
  ]

  if (soul.age) facts.push({ axis: 'age', value: AGES[soul.age].label })
  if (soul.build) facts.push({ axis: 'build', value: BUILDS[soul.build].label })
  if (soul.hairColor) facts.push({ axis: 'hairColor', value: HAIR_COLORS[soul.hairColor].label })
  if (soul.hairStyle) facts.push({ axis: 'hairStyle', value: HAIR_STYLES[soul.hairStyle].label })
  if (soul.eyeColor) facts.push({ axis: 'eyeColor', value: EYE_COLORS[soul.eyeColor].label })
  if (soul.skin) facts.push({ axis: 'skin', value: SKINS[soul.skin].label })
  if (soul.outfit) facts.push({ axis: 'outfit', value: OUTFITS[soul.outfit].label })
  if (soul.vibe) facts.push({ axis: 'vibe', value: VIBES[soul.vibe].label })

  return facts
}

// The traits, as labels, capped exactly the way composeSoul caps them. A soul
// object built by hand (a PROMPT_LIBRARY entry, a legacy row) could carry more
// than MAX_TRAITS; the composer would silently drop the tail, so a card that
// listed them all would promise traits the picture never had.
export function soulTraitLabels(soul: Soul): string[] {
  return soul.traits.slice(0, MAX_TRAITS).map((traitId) => TRAITS[traitId].label)
}
