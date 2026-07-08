// apps/web/src/modules/Generator/components/ModelSelectOption.tsx
// One row of the ModelSelect listbox: the provider logo, our brand name + the
// honest provider label, a tier chip, the tariff (credits + $ equivalent) and a
// one-line description. Selection reads as the AMBER RING (design.md: "model
// picker highlights = amber"); the keyboard/hover active row lifts one surface
// step to ridge. Both cues are non-colour-only — aria-selected carries selection
// for assistive tech, the ring is a shape, and the tier/price are text.
import { useTranslation } from 'react-i18next'
import type { CatalogModel } from '@opencreate/contracts'
import { Badge } from 'shared/ui'
import { presentationFor, tariffFor } from '../model/modelPresentation'
import { ProviderMark } from './ProviderMark'

export type ModelSelectOptionProps = {
  // The catalog model this row represents
  model: CatalogModel
  // DOM id so the listbox can point aria-activedescendant at the active row
  optionId: string
  // Currently the chosen model (amber ring + aria-selected)
  isSelected: boolean
  // Currently the keyboard/hover-highlighted row (ridge surface step)
  isActive: boolean
  // Commit this model (click / Enter on the active row)
  onChoose: () => void
  // Make this row the active one (pointer enters it)
  onActivate: () => void
}

export function ModelSelectOption({
  model,
  optionId,
  isSelected,
  isActive,
  onChoose,
  onActivate,
}: ModelSelectOptionProps) {
  const { t } = useTranslation()
  const { provider, descriptionKey } = presentationFor(model.id)
  const tariff = tariffFor(model)

  return (
    // role="option" + aria-selected are the listbox contract; the row is a div,
    // not a button, because the listbox (not each row) owns keyboard focus.
    <div
      id={optionId}
      role="option"
      aria-selected={isSelected}
      onClick={onChoose}
      onMouseEnter={onActivate}
      className={`flex cursor-pointer items-start gap-3 rounded-lg px-2.5 py-2.5 transition-colors duration-150 ${
        isActive ? 'bg-ridge' : ''
      } ${isSelected ? 'ring-1 ring-glow-amber/60 ring-inset' : ''}`}
    >
      {/* Provider logo tile — steel chip, mist glyph (amber when selected) */}
      <span
        className={`grid size-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-steel ${
          isSelected ? 'text-glow-amber' : 'text-mist'
        }`}
      >
        <ProviderMark provider={provider} className="h-5 w-5" />
      </span>

      {/* Name + provider label + description */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-white">{model.name}</span>
          <Badge variant="accent">{t(`generator.tier.${model.tier}`)}</Badge>
        </div>
        <p className="truncate text-xs text-mist-dim">{model.providerLabel}</p>
        <p className="mt-1 text-xs text-mist-dim">{t(descriptionKey)}</p>
      </div>

      {/* Tariff: credits + the $0.01/credit equivalent, mono numerals */}
      <span className="shrink-0 pt-0.5 text-xs font-medium text-mist">
        {t('generator.model.tariff', { credits: tariff.credits, dollars: tariff.dollars })}
      </span>
    </div>
  )
}
