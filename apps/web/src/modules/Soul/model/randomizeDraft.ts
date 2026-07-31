// apps/web/src/modules/Soul/model/randomizeDraft.ts
// «Shuffle» — a whole random character in one draft. The composer's dice button
// calls this so a user who does not know where to start gets a VALID, buildable
// starting point instead of staring at a blank form.
//
// Every value is drawn from the contract ENUMS (soul.ts) — the same source
// soulOptions builds its pickers from — never a hardcoded list. Adding an
// archetype or a trait to contracts widens the shuffle for free, and a value
// this file can pick is by construction a value the schema and the API accept:
// the two required axes are always set and the traits never exceed MAX_TRAITS,
// so the result satisfies soulSchema without a validation round-trip.
import {
  MAX_TRAITS,
  TRAITS,
  ageSchema,
  archetypeSchema,
  buildSchema,
  eyeColorSchema,
  hairColorSchema,
  hairStyleSchema,
  outfitSchema,
  builtinStyleIdSchema,
  skinSchema,
  vibeSchema,
} from '@opencreate/contracts'
import type { Soul, TraitId } from '@opencreate/contracts'
import { EMPTY_DRAFT } from './soulDraft'
import type { SoulDraft } from './soulDraft'

// One random member of a readonly tuple (a zod enum's `.options`).
function pick<T>(values: readonly T[]): T {
  return values[Math.floor(Math.random() * values.length)] as T
}

// The eight OPTIONAL axes, each paired with its enum. A table, not eight
// scattered lines, so a new optional axis is one row — and so every axis draws
// from its own contract enum rather than a copy of it.
const OPTIONAL_AXES = [
  ['age', ageSchema],
  ['build', buildSchema],
  ['hairColor', hairColorSchema],
  ['hairStyle', hairStyleSchema],
  ['eyeColor', eyeColorSchema],
  ['skin', skinSchema],
  ['outfit', outfitSchema],
  ['vibe', vibeSchema],
] as const

// Every trait id, from the contract table — the multi-select's full vocabulary.
const TRAIT_IDS = Object.keys(TRAITS) as TraitId[]

// A distinct random subset, capped at MAX_TRAITS: shuffle the ids, take a
// random-length prefix. Distinct by construction (a prefix of a shuffle), so it
// can never trip the schema's `.max` or the encoder's silent-drop threshold.
function pickTraits(): TraitId[] {
  const shuffled = [...TRAIT_IDS].sort(() => Math.random() - 0.5)
  const count = Math.floor(Math.random() * (MAX_TRAITS + 1))
  return shuffled.slice(0, count)
}

// A random, VALID soul: the two required axes always set, a coin-flip on each
// optional axis (an unset axis is a real choice, so half the time it stays
// unset), and 0..MAX_TRAITS distinct traits.
function randomizeSoul(): Soul {
  const soul: Soul = {
    archetype: pick(archetypeSchema.options),
    // Builtin enum, not the open wire id: shuffling needs a finite vocabulary
    // to draw from, and a soul's style axis is builtin by contract anyway.
    styleId: pick(builtinStyleIdSchema.options),
    traits: pickTraits(),
    notes: '',
  }
  for (const [key, schema] of OPTIONAL_AXES) {
    // Half the axes stay unset — a shuffled character reads as a person, not a
    // maxed-out spec sheet
    if (Math.random() < 0.5) Object.assign(soul, { [key]: pick(schema.options) })
  }
  return soul
}

// The composer preserves the typed name (see SoulStudio.handleShuffle), so the
// draft's name starts empty here — shuffling the LOOK should not invent a name.
export function randomizeDraft(): SoulDraft {
  return { name: EMPTY_DRAFT.name, soul: randomizeSoul() }
}
