// apps/web/src/modules/Generator/components/PromptField.tsx
// The commission sheet's prompt group: quiet mono caption + steel filled
// textarea (the v3 field recipe — same surface-step treatment as shared Input,
// which only ships as <input>, hence this local textarea twin). Extracted from
// GeneratorPanel to keep the panel under the 200-line component cap.
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

export type PromptFieldProps = {
  // Current draft prompt from the generator store
  value: string
  // Store action (generatorStore.setPrompt)
  onChange: (prompt: string) => void
}

export function PromptField({ value, onChange }: PromptFieldProps) {
  const { t } = useTranslation()
  // Stable generated id wires label→textarea without the caller passing one
  const promptId = useId()
  return (
    <div className="flex flex-col gap-1.5">
      {/* Quiet mono caption, matching shared Input — getByLabelText('Prompt')
          keeps matching the i18n string (label text itself is unchanged) */}
      <label htmlFor={promptId} className="text-xs text-mist-dim">
        {t('generator.prompt.label')}
      </label>
      {/* Steel filled field, 8px radius: identical surface-step treatment to
          shared/ui Input so the whole sheet reads as one form system; focus
          swaps the white/10 hairline for portal blue */}
      <textarea
        id={promptId}
        rows={3}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t('generator.prompt.placeholder')}
        className="rounded-lg border border-white/10 bg-steel px-3 py-2 text-base text-mist transition-colors duration-200 placeholder:text-mist-dim/60 focus-visible:border-portal focus-visible:outline-none"
      />
    </div>
  )
}
