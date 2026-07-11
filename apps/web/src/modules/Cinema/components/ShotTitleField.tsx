// apps/web/src/modules/Cinema/components/ShotTitleField.tsx
// The optional title-overlay group of the shot inspector: an amber toggle pill
// and, when it is on, the overlay text + its position. Extracted from
// ShotInspector because it is the only sub-form there with its own on/off state
// and its own progressive disclosure — folding it back in was what pushed that
// file past 200 lines.
//
// Fully controlled: every value lives in the inspector's draft, so Save/Generate
// build one patch from one source. The text input has no visible <label> of its
// own (the placeholder doubles as the field name), so it carries an explicit
// aria-label — a placeholder is not an accessible name.
import { useTranslation } from 'react-i18next'
import type { TitlePosition } from '@opencreate/contracts'
import { titlePositionSchema } from '@opencreate/contracts'
import { Select } from 'shared/ui'

export type ShotTitleFieldProps = {
  // Is the overlay enabled for this shot?
  isEnabled: boolean
  onToggle: () => void
  text: string
  onTextChange: (text: string) => void
  position: TitlePosition
  onPositionChange: (position: TitlePosition) => void
}

export function ShotTitleField({
  isEnabled,
  onToggle,
  text,
  onTextChange,
  position,
  onPositionChange,
}: ShotTitleFieldProps) {
  const { t } = useTranslation()
  const textLabel = t('cinema.inspector.titlePlaceholder')

  return (
    <div className="flex flex-col gap-2">
      {/* aria-pressed, not a checkbox: this is a toggle button in the kit's
          amber selection language (PillGroup uses the same convention). */}
      <button
        type="button"
        aria-pressed={isEnabled}
        onClick={onToggle}
        className={`min-h-10 self-start rounded-full border border-white/10 px-4 py-1.5 text-xs font-medium transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none ${
          isEnabled ? 'bg-specimen-amber/20 text-lumen-amber' : 'text-mist-dim hover:bg-ridge'
        }`}
      >
        {t('cinema.inspector.titleToggle')}
      </button>

      {isEnabled ? (
        <div className="flex min-w-0 flex-col gap-2">
          <input
            value={text}
            onChange={(event) => onTextChange(event.target.value)}
            placeholder={textLabel}
            aria-label={textLabel}
            className="min-w-0 rounded-lg border border-white/10 bg-steel px-3 py-2 text-sm text-mist placeholder:text-mist-dim/60 focus-visible:border-portal focus-visible:outline-none"
          />
          <Select<TitlePosition>
            label={t('cinema.inspector.titlePosition')}
            options={titlePositionSchema.options.map((value) => ({
              value,
              label: t(`cinema.position.${value}`),
            }))}
            value={position}
            onChange={onPositionChange}
          />
        </div>
      ) : null}
    </div>
  )
}
