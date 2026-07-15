// apps/web/src/modules/Soul/model/soulDraft.ts
// The constructor's editable state, and the ONE place the trait cap is enforced
// in the client.
//
// WHY THE CAP LIVES IN A PURE FUNCTION AND NOT IN THE CHIP'S onClick:
// MAX_TRAITS is not a styling preference, it is a fact about diffusion text
// encoders — past a handful of concepts they quietly drop the tail, so a
// 15-trait character renders as a 4-trait one and the user blames us for the
// eleven they paid for and did not get (soul.ts, "WHY SIX"). The schema refuses
// it, the API refuses it, and the UI must both DISABLE the 7th chip and be
// unable to add it even if something else calls this. Two enforcement points, one
// rule.
import { MAX_TRAITS } from '@opencreate/contracts'
import type { Entity, Soul, TraitId } from '@opencreate/contracts'

export type SoulDraft = {
  // The character's display name — the only free-text field the entity keeps
  // verbatim (description is derived from the soul)
  name: string
  // The structured spec itself
  soul: Soul
}

// A new character starts as the least-committal thing the schema allows: the two
// required axes get a value, everything else is unset (an unset axis contributes
// nothing to the prompt, so the preview starts honest and short).
export const EMPTY_SOUL: Soul = {
  archetype: 'female',
  styleId: 'disney',
  traits: [],
  notes: '',
}

export const EMPTY_DRAFT: SoulDraft = { name: '', soul: EMPTY_SOUL }

// Reopen an existing character in the constructor. A soul-less entity (a legacy
// upload, an object) has no structure to round-trip, so it falls back to the
// empty soul — the constructor cannot invent one from prose, which is precisely
// why `soul` exists beside `description` rather than instead of it.
export function draftFromEntity(entity: Entity): SoulDraft {
  return { name: entity.name, soul: entity.soul ?? EMPTY_SOUL }
}

// Add or remove a trait, refusing to exceed the cap. Returning the SAME array
// when the cap is hit (rather than throwing) keeps the caller trivial: the chip
// is already disabled, so this branch is only reachable by a keyboard/AT path we
// would rather no-op than crash.
export function toggleTrait(traits: TraitId[], traitId: TraitId): TraitId[] {
  if (traits.includes(traitId)) return traits.filter((current) => current !== traitId)
  if (traits.length >= MAX_TRAITS) return traits
  return [...traits, traitId]
}

// A chip the user cannot pick right now: not already chosen AND the cap is full.
// Selected chips stay enabled — un-picking must always be possible, or the user
// is stuck at six with no way back.
export function isTraitDisabled(traits: TraitId[], traitId: TraitId): boolean {
  return !traits.includes(traitId) && traits.length >= MAX_TRAITS
}
