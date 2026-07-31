// apps/web/src/modules/Cinema/components/PresetPickers.tsx
// The four structured prompt-preset pickers (style · framing · motion · quality).
// Framing, motion and quality are closed enums over the shared contract tables —
// the SAME tables the server composes from, so a picker and the composition can
// never disagree (ADR §3).
//
// STYLE IS NO LONGER ONE OF THEM. Since ADR style-studio D5 a style is a registry
// entry, not an enum member: builtin rows and the styles the user wrote in the
// Style Studio arrive together from GET /api/styles. Cinema must not import
// modules/Styles, so the list travels as a PROP from the route — the same seam
// this editor already uses for the model catalog, templates and the cast.
// Controlled via a single draft object + a partial onChange, so the consumers
// (ShotInspector, and — for style only — StoryboardModal) stay thin.
import { useTranslation } from 'react-i18next'
import type { CameraMotion, CameraShot, Quality, Style } from '@opencreate/contracts'
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
  // The style registry (builtin + the caller's own), injected from the route.
  // Empty while the request is in flight — styleOptions then falls back to the
  // bundled builtins, so the picker is never empty and never disabled.
  styles: readonly Style[]
}

export function PresetPickers({ value, onChange, styles }: PresetPickersProps) {
  const { t } = useTranslation()
  return (
    <div className="grid grid-cols-2 gap-2">
      <Select<StyleChoice>
        label={t('cinema.inspector.style')}
        // The '' sentinel is prepended here, with translated copy: styleId — unlike
        // the other three axes — has no first-class 'none' in its own vocabulary.
        options={[{ value: '', label: t('cinema.settings.styleNone') }, ...styleOptions(styles, t)]}
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
