// apps/web/src/modules/Soul/components/SoulConstructor.tsx
// The constructor: a character is BUILT here, from tables — never typed into a
// prompt box. Two required axes as pills (a character always is something, in
// some style), eight optional axes as dropdowns, the capped trait chips, a free
// notes tail, and the live composed prompt.
//
// CONTROLLED, deliberately. The draft lives in the parent (the studio page, or
// the soul card's edit modal), because "Open in constructor" from the prompt
// library must be able to REPLACE the whole draft from outside. A component that
// owned its own state could only be reset by remounting it with a key — which
// would throw away the scroll position and the focus every time.
//
// It composes NOTHING itself: every fragment, label and order comes from
// @opencreate/contracts (via model/soulOptions + model/soulPresentation).
import { useTranslation } from 'react-i18next'
import type { Archetype, Soul, StyleId, TraitId } from '@opencreate/contracts'
import { Button, Card, Input, PillGroup, Select } from 'shared/ui'
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
import type { SoulDraft } from '../model/soulDraft'
import { SoulPreview } from './SoulPreview'
import { TraitPicker } from './TraitPicker'

export type SoulConstructorProps = {
  // The draft being edited — owned by the parent (see the header)
  draft: SoulDraft
  onChange: (draft: SoulDraft) => void
  // Fired by the submit pill; the parent owns the mutation (create vs update)
  onSubmit: () => void
  // Localized label of the submit pill ("Create character" / "Save")
  submitLabel: string
  isSubmitting: boolean
  // Already-localized failure message, rendered as a calm inline alert
  error?: string | null | undefined
}

export function SoulConstructor({
  draft,
  onChange,
  onSubmit,
  submitLabel,
  isSubmitting,
  error = null,
}: SoulConstructorProps) {
  const { t } = useTranslation()
  const { soul } = draft
  const anyLabel = t('soul.field.any')

  // One patch helper for all ten axes: a picker reports only the axis it changed.
  // `undefined` is the wire-correct "unset" (the schema has no 'none' sentinel).
  const patchSoul = (patch: Partial<Soul>) => onChange({ ...draft, soul: { ...soul, ...patch } })

  const isNamed = draft.name.trim().length > 0

  return (
    <Card surface="glass" padding="lg" title={t('soul.constructor.title')}>
      <div className="flex flex-col gap-6">
        <Input
          label={t('soul.constructor.name')}
          placeholder={t('soul.constructor.namePlaceholder')}
          value={draft.name}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
        />

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

        <SoulPreview soul={soul} />

        {error ? (
          // Calm inline failure: a steel block with the glow-red status rule (the
          // design law keeps red for the STATUS, never for the whole surface)
          <p
            role="alert"
            className="rounded-lg border-l-2 border-glow-red bg-steel px-3 py-2 text-sm text-mist"
          >
            {error}
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          {/* Creating a character costs NOTHING — say so, right next to the button,
              because everything else in this app charges credits and the user has
              learned to expect it */}
          <p className="text-xs text-mist-dim">{t('soul.constructor.free')}</p>
          <Button onClick={onSubmit} isLoading={isSubmitting} disabled={!isNamed}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </Card>
  )
}
