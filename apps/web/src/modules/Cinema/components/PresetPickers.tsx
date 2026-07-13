// apps/web/src/modules/Cinema/components/PresetPickers.tsx
// The four structured prompt-preset pickers (style · framing · motion · quality)
// rendered from the shared contract tables — the SAME tables the server composes
// from, so a picker and the composition can never disagree (ADR §3). Controlled
// via a single draft object + a partial onChange, so the two consumers
// (ShotInspector, and — for style only — StoryboardModal) stay thin.
import { useTranslation } from 'react-i18next'
import type { CameraMotion, CameraShot, Quality } from '@opencreate/contracts'
import { Select } from 'shared/ui'
import {
  cameraMotionOptions,
  cameraShotOptions,
  qualityOptions,
  styleOptions,
} from '../model/presetOptions'
import type { PresetDraft, StyleChoice } from '../model/presetOptions'

export type PresetPickersProps = {
  value: PresetDraft
  // Partial patch so a picker only reports the axis it changed
  onChange: (patch: Partial<PresetDraft>) => void
}

export function PresetPickers({ value, onChange }: PresetPickersProps) {
  const { t } = useTranslation()
  return (
    <div className="grid grid-cols-2 gap-2">
      <Select<StyleChoice>
        label={t('cinema.inspector.style')}
        options={[{ value: '', label: t('cinema.settings.styleNone') }, ...styleOptions(t)]}
        value={value.styleId}
        onChange={(styleId) => onChange({ styleId })}
      />
      <Select<CameraShot>
        label={t('cinema.inspector.camera')}
        options={cameraShotOptions(t)}
        value={value.cameraShot}
        onChange={(cameraShot) => onChange({ cameraShot })}
      />
      <Select<CameraMotion>
        label={t('cinema.inspector.motion')}
        options={cameraMotionOptions(t)}
        value={value.cameraMotion}
        onChange={(cameraMotion) => onChange({ cameraMotion })}
      />
      <Select<Quality>
        label={t('cinema.inspector.quality')}
        options={qualityOptions(t)}
        value={value.quality}
        onChange={(quality) => onChange({ quality })}
      />
    </div>
  )
}
