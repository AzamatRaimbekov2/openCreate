// apps/web/src/modules/Soul/components/SoulAxes.tsx
// The character's axes, as tables — the shared BODY of the builder. A character
// is BUILT here, never typed into a prompt box: the two REQUIRED axes as pills
// (archetype, style — a dropdown for a choice with no empty state hides it),
// eight OPTIONAL axes as dropdowns (each with an "any" row), the capped trait
// chips, and the free-notes escape hatch.
//
// CONTROLLED and NAME-LESS on purpose. It is reused by TWO owners that frame the
// name and the submit differently: the studio's right BUILDER panel (the name
// lives in the bottom composer dock) and the soul card's edit MODAL
// (SoulConstructor, name at the top). Holding the axes in one place is what stops
// the two from drifting a picker apart. It composes NOTHING itself: every
// fragment, label and order comes from @opencreate/contracts (via soulOptions).
import { useTranslation } from 'react-i18next'
import type { Archetype, Soul, StyleId, TraitId } from '@opencreate/contracts'
import { PillGroup, Select } from 'shared/ui'
import {
  ANY,
  ageOptions,
  archetypeOptions,
  buildOptions,
  eyeColorOptions,
  hairColorOptions,
  hairStyleOptions,
  optionalValue,
  outfitOptions,
  skinOptions,
  styleOptions,
  vibeOptions,
} from '../model/soulOptions'
import { toggleTrait } from '../model/soulDraft'
import { TraitPicker } from './TraitPicker'

export type SoulAxesProps = {
  // The spec being edited — owned by the parent (studio draft or edit-modal draft)
  soul: Soul
  onChange: (soul: Soul) => void
}

export function SoulAxes({ soul, onChange }: SoulAxesProps) {
  const { t } = useTranslation()
  const anyLabel = t('soul.field.any')

  // One patch helper for all ten axes: a picker reports only the axis it changed.
  // `undefined` is the wire-correct "unset" (the schema has no 'none' sentinel).
  const patchSoul = (patch: Partial<Soul>) => onChange({ ...soul, ...patch })

  return (
    <div className="flex flex-col gap-6">
      {/* The two REQUIRED axes: pills, because there is no empty state to hide */}
      <PillGroup<Archetype>
        label={t('soul.field.archetype')}
        options={archetypeOptions()}
        value={soul.archetype}
        onChange={(archetype) => patchSoul({ archetype })}
      />
      <PillGroup<StyleId>
        label={t('soul.field.style')}
        options={styleOptions()}
        value={soul.styleId}
        onChange={(styleId) => patchSoul({ styleId })}
      />

      {/* The optional axes. Each carries an "any" row: an unset axis contributes
          nothing to the prompt, which is a real choice and must be reachable. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select
          label={t('soul.field.age')}
          options={ageOptions(anyLabel)}
          value={soul.age ?? ANY}
          onChange={(value) => patchSoul({ age: optionalValue(value) })}
        />
        <Select
          label={t('soul.field.build')}
          options={buildOptions(anyLabel)}
          value={soul.build ?? ANY}
          onChange={(value) => patchSoul({ build: optionalValue(value) })}
        />
        <Select
          label={t('soul.field.hairColor')}
          options={hairColorOptions(anyLabel)}
          value={soul.hairColor ?? ANY}
          onChange={(value) => patchSoul({ hairColor: optionalValue(value) })}
        />
        <Select
          label={t('soul.field.hairStyle')}
          options={hairStyleOptions(anyLabel)}
          value={soul.hairStyle ?? ANY}
          onChange={(value) => patchSoul({ hairStyle: optionalValue(value) })}
        />
        <Select
          label={t('soul.field.eyeColor')}
          options={eyeColorOptions(anyLabel)}
          value={soul.eyeColor ?? ANY}
          onChange={(value) => patchSoul({ eyeColor: optionalValue(value) })}
        />
        <Select
          label={t('soul.field.skin')}
          options={skinOptions(anyLabel)}
          value={soul.skin ?? ANY}
          onChange={(value) => patchSoul({ skin: optionalValue(value) })}
        />
        <Select
          label={t('soul.field.outfit')}
          options={outfitOptions(anyLabel)}
          value={soul.outfit ?? ANY}
          onChange={(value) => patchSoul({ outfit: optionalValue(value) })}
        />
        <Select
          label={t('soul.field.vibe')}
          options={vibeOptions(anyLabel)}
          value={soul.vibe ?? ANY}
          onChange={(value) => patchSoul({ vibe: optionalValue(value) })}
        />
      </div>

      <TraitPicker
        traits={soul.traits}
        onToggle={(traitId: TraitId) => patchSoul({ traits: toggleTrait(soul.traits, traitId) })}
      />

      {/* The escape hatch (soul.ts): anything the tables cannot say goes here and
          is appended VERBATIM, last. It is not a second prompt box — it is the
          admission that a constructor cannot round-trip prose. */}
      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-mist-dim">{t('soul.constructor.notes')}</span>
        <textarea
          rows={2}
          maxLength={500}
          value={soul.notes}
          placeholder={t('soul.constructor.notesPlaceholder')}
          onChange={(event) => patchSoul({ notes: event.target.value })}
          className="rounded-lg border border-white/10 bg-steel px-3 py-2 text-base text-mist transition-colors duration-200 placeholder:text-mist-dim/60 focus-visible:border-portal focus-visible:outline-none"
        />
      </label>
    </div>
  )
}
