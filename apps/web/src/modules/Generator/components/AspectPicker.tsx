// apps/web/src/modules/Generator/components/AspectPicker.tsx
// Aspect-ratio segmented control. Options are already filtered by the panel to
// what the selected model supports — this component only presents them.
import { useTranslation } from 'react-i18next'
import type { AspectRatio } from '@opencreate/contracts'
import { PillGroup } from 'shared/ui'

export type AspectPickerProps = {
  // Aspect ratios the SELECTED model supports (never the full enum)
  options: AspectRatio[]
  // Current selection — the store guarantees it is one of `options`
  value: AspectRatio
  // Store action (generatorStore.setAspectRatio)
  onChange: (aspectRatio: AspectRatio) => void
}

export function AspectPicker({ options, value, onChange }: AspectPickerProps) {
  const { t } = useTranslation()
  return (
    <PillGroup
      label={t('generator.aspect.label')}
      // The ratio string is its own universal label ("16:9") — not translated
      options={options.map((ratio) => ({ value: ratio, label: ratio }))}
      value={value}
      onChange={onChange}
    />
  )
}
