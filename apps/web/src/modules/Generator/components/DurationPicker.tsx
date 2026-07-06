// apps/web/src/modules/Generator/components/DurationPicker.tsx
// Video duration pills ("5s", "8s"). Rendered by the panel ONLY for video
// models — image generations have no duration dimension at all.
import { useTranslation } from 'react-i18next'
import { PillGroup } from 'shared/ui'

export type DurationPickerProps = {
  // Seconds the selected video model offers (catalog durationOptions)
  options: number[]
  // Current selection — the store guarantees it is one of `options`
  value: number | undefined
  // Store action (generatorStore.setDuration)
  onChange: (duration: number) => void
}

export function DurationPicker({ options, value, onChange }: DurationPickerProps) {
  const { t } = useTranslation()
  return (
    <PillGroup
      label={t('generator.duration.label')}
      // Localized seconds suffix: "5s" (en) / "5 с" (ru)
      options={options.map((seconds) => ({
        value: seconds,
        label: t('generator.duration.seconds', { count: seconds }),
      }))}
      value={value}
      onChange={onChange}
    />
  )
}
