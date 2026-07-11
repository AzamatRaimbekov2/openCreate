// apps/web/src/modules/Cinema/components/ShotClipFields.tsx
// The "Clip" group of the shot inspector: which video model generates it, how
// long it runs, and how it transitions in. Extracted from ShotInspector to keep
// that file an orchestrator under the 200-line ceiling — these four Selects are
// one concern (the mechanics of the clip) and change together.
//
// Fully controlled: every value belongs to the inspector's draft so Save and
// Generate build one patch from one source of truth.
import { useTranslation } from 'react-i18next'
import type { CatalogVideoModel, Transition } from '@opencreate/contracts'
import { transitionSchema } from '@opencreate/contracts'
import { Select } from 'shared/ui'
import { SHOT_DURATIONS_SECONDS } from '../model/presetOptions'

// The only crossfade lengths we offer — short enough that a 4s shot survives one
const CROSSFADE_MS = [300, 500, 800] as const

export type ShotClipFieldsProps = {
  // Video models from the catalog; empty until it resolves (placeholder shows)
  videoModels: CatalogVideoModel[]
  modelId: string
  onModelChange: (modelId: string) => void
  // Display duration in whole seconds, as a string (Select values are strings)
  seconds: string
  onSecondsChange: (seconds: string) => void
  transition: Transition
  onTransitionChange: (transition: Transition) => void
  // Crossfade length in ms, as a string; only meaningful when crossfading
  transitionMs: string
  onTransitionMsChange: (transitionMs: string) => void
}

export function ShotClipFields({
  videoModels,
  modelId,
  onModelChange,
  seconds,
  onSecondsChange,
  transition,
  onTransitionChange,
  transitionMs,
  onTransitionMsChange,
}: ShotClipFieldsProps) {
  const { t } = useTranslation()

  return (
    <div className="grid grid-cols-2 gap-2">
      <Select
        label={t('cinema.inspector.model')}
        placeholder={t('cinema.inspector.noModel')}
        options={videoModels.map((model) => ({
          value: model.id,
          label: model.name,
          caption: model.providerLabel,
        }))}
        value={modelId}
        onChange={onModelChange}
      />
      <Select
        label={t('cinema.inspector.duration')}
        options={SHOT_DURATIONS_SECONDS.map((s) => ({
          value: String(s),
          label: t('cinema.shot.seconds', { count: s }),
        }))}
        value={seconds}
        onChange={onSecondsChange}
      />
      <Select<Transition>
        label={t('cinema.inspector.transition')}
        options={transitionSchema.options.map((value) => ({
          value,
          label: t(`cinema.transition.${value}`),
        }))}
        value={transition}
        onChange={onTransitionChange}
      />
      {/* The length only exists for a crossfade — never a dead control */}
      {transition === 'crossfade' ? (
        <Select
          label={t('cinema.inspector.transitionMs')}
          options={CROSSFADE_MS.map((ms) => ({ value: String(ms), label: `${ms} ms` }))}
          value={transitionMs}
          onChange={onTransitionMsChange}
        />
      ) : null}
    </div>
  )
}
