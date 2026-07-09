// apps/web/src/modules/Entities/model/entityPresets.ts
// Preset description snippets, per entity kind. The owner chose "free text +
// presets" over structured fields or an LLM: a chip appends a canonical phrase
// to the description, so the same click always yields the same words (no model
// call, no latency, fully translatable).
//
// These are i18n KEYS, not strings — the UI localizes them, and the appended
// text follows the user's language. The KEY is stable; the phrase behind it is
// translation data.
import type { EntityKind } from '@opencreate/contracts'

// A handful of high-signal snippets per kind. Deliberately short: the point is a
// fast start, not a template the user must edit back down.
export const PRESET_KEYS: Record<EntityKind, string[]> = {
  character: [
    'entities.presets.character.cinematic',
    'entities.presets.character.portrait',
    'entities.presets.character.photoreal',
    'entities.presets.character.studioLight',
  ],
  object: [
    'entities.presets.object.productShot',
    'entities.presets.object.isolated',
    'entities.presets.object.detailed',
  ],
  place: [
    'entities.presets.place.wide',
    'entities.presets.place.goldenHour',
    'entities.presets.place.atmospheric',
  ],
  other: ['entities.presets.other.detailed', 'entities.presets.other.photoreal'],
}
