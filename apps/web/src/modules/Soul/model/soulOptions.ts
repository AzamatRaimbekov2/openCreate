// apps/web/src/modules/Soul/model/soulOptions.ts
// Select-option builders derived FROM the contract tables (soul.ts / presets.ts)
// — the same tables the API composes from, so a picker and the composition can
// never disagree (ADR §2). The web has no list of its own to drift.
//
// TWO THINGS ARE LOAD-BEARING HERE:
//
// 1. The ORDER comes from the zod enum's `.options`, not from Object.keys. It is
//    typed (`Archetype[]`, not `string[]`), so the table lookup below needs no
//    cast — the enum IS the ordering, and adding a value to contracts adds a
//    picker row for free.
//
// 2. Every optional axis widens to `T | ''`. The soul schema leaves an unset axis
//    OUT of the object (there is no 'none' sentinel row — presets.ts uses one,
//    soul.ts deliberately does not), but a <Select> must still have something to
//    show for "no preference". '' is that value at the CONTROL boundary only; the
//    constructor converts it back to `undefined` before it touches the draft.
import {
  AGES,
  ARCHETYPES,
  BUILDS,
  EYE_COLORS,
  HAIR_COLORS,
  HAIR_STYLES,
  OUTFITS,
  SKINS,
  STYLE_PRESETS,
  VIBES,
  ageSchema,
  archetypeSchema,
  buildSchema,
  eyeColorSchema,
  hairColorSchema,
  hairStyleSchema,
  outfitSchema,
  skinSchema,
  styleIdSchema,
  vibeSchema,
} from '@opencreate/contracts'
import type {
  Age,
  Archetype,
  Build,
  EyeColor,
  HairColor,
  HairStyle,
  Outfit,
  Skin,
  StyleId,
  Vibe,
} from '@opencreate/contracts'
import type { PillOption, SelectOption } from 'shared/ui'

// The "no preference" value of an optional axis, at the control boundary only.
export const ANY = ''
export type Optional<T extends string> = T | typeof ANY

// One row per enum value, labelled by the contract table. The labels are already
// Russian (the same convention STYLE_PRESETS established) and are deliberately
// NOT routed through i18n: they are DATA the API shares, not app copy.
function toOptions<T extends string>(
  ids: readonly T[],
  table: Record<T, { label: string }>,
): SelectOption<T>[] {
  return ids.map((id) => ({ value: id, label: table[id].label }))
}

// Prepend the "any" row to an optional axis. `anyLabel` is the caller's localized
// string — the ONE label in this file the app owns, so it comes from i18n.
function withAny<T extends string>(
  options: SelectOption<T>[],
  anyLabel: string,
): SelectOption<Optional<T>>[] {
  return [{ value: ANY, label: anyLabel }, ...options]
}

// The two REQUIRED axes render as pills (a character always is something, in
// some style) — a dropdown for a choice with no empty state hides it.
export function archetypeOptions(): PillOption<Archetype>[] {
  return toOptions(archetypeSchema.options, ARCHETYPES)
}

export function styleOptions(): PillOption<StyleId>[] {
  return toOptions(styleIdSchema.options, STYLE_PRESETS)
}

// The optional axes render as Selects, each with the "any" row first.
export function ageOptions(anyLabel: string): SelectOption<Optional<Age>>[] {
  return withAny(toOptions(ageSchema.options, AGES), anyLabel)
}

export function buildOptions(anyLabel: string): SelectOption<Optional<Build>>[] {
  return withAny(toOptions(buildSchema.options, BUILDS), anyLabel)
}

export function hairColorOptions(anyLabel: string): SelectOption<Optional<HairColor>>[] {
  return withAny(toOptions(hairColorSchema.options, HAIR_COLORS), anyLabel)
}

export function hairStyleOptions(anyLabel: string): SelectOption<Optional<HairStyle>>[] {
  return withAny(toOptions(hairStyleSchema.options, HAIR_STYLES), anyLabel)
}

export function eyeColorOptions(anyLabel: string): SelectOption<Optional<EyeColor>>[] {
  return withAny(toOptions(eyeColorSchema.options, EYE_COLORS), anyLabel)
}

export function skinOptions(anyLabel: string): SelectOption<Optional<Skin>>[] {
  return withAny(toOptions(skinSchema.options, SKINS), anyLabel)
}

export function outfitOptions(anyLabel: string): SelectOption<Optional<Outfit>>[] {
  return withAny(toOptions(outfitSchema.options, OUTFITS), anyLabel)
}

export function vibeOptions(anyLabel: string): SelectOption<Optional<Vibe>>[] {
  return withAny(toOptions(vibeSchema.options, VIBES), anyLabel)
}

// '' → the axis is absent from the draft. The Soul schema marks these optional,
// so `undefined` is the wire-correct "unset" — not an empty string, which would
// fail zod and reach the model as a dangling comma if it ever got past.
export function optionalValue<T extends string>(value: Optional<T>): T | undefined {
  return value === ANY ? undefined : value
}
