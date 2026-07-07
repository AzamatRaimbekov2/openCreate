// apps/web/src/modules/Generator/components/PromptField.tsx
// The commission sheet's prompt group: micro-label + hairline underline
// textarea (the editorial "printed form" line — same recipe as shared Input,
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
      {/* Micro-label voice, matching shared Input: uppercase is CSS-only so
          getByLabelText('Prompt') keeps matching the i18n string */}
      <label
        htmlFor={promptId}
        className="text-[11px] font-medium tracking-[0.18em] text-ink-soft uppercase"
      >
        {t('generator.prompt.label')}
      </label>
      {/* Hairline underline field: transparent body, 1px rule that turns
          vermillion on focus — the extra px comes from a box-shadow so the
          layout never shifts (identical treatment to shared/ui Input) */}
      <textarea
        id={promptId}
        rows={3}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t('generator.prompt.placeholder')}
        className="border-0 border-b border-ink/30 bg-transparent px-0.5 py-2 text-base text-ink transition-colors duration-200 placeholder:text-ink-soft/50 focus-visible:border-vermillion focus-visible:shadow-[0_1px_0_0_var(--color-vermillion)] focus-visible:outline-none"
      />
    </div>
  )
}
