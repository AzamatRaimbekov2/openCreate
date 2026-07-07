// apps/web/src/modules/Generator/components/ModelPicker.tsx
// Model cards for the current generation type. Each card shows our product
// name, the honest provider label underneath (no rebadging deception — spec
// copy rule), and the credit price so choice and cost are decided together.
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { CatalogModel } from '@opencreate/contracts'

export type ModelPickerProps = {
  // Models of the CURRENT type only (panel filters by store.type)
  models: CatalogModel[]
  // Selected catalog model id
  selectedId: string | null
  // Store action (generatorStore.setModel)
  onSelect: (modelId: string) => void
}

// The card's price hint: images cost a flat amount, videos start at the
// cheapest duration ("from 35"). Typed with i18next's TFunction — a structural
// signature would fight exactOptionalPropertyTypes on the options tuple.
function priceHint(model: CatalogModel, t: TFunction) {
  if (model.type === 'image') return t('generator.cost', { count: model.credits })
  const cheapest = Math.min(...Object.values(model.creditsByDuration))
  return t('generator.model.from', { count: cheapest })
}

export function ModelPicker({ models, selectedId, onSelect }: ModelPickerProps) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-2">
      {/* Visible caption in the quiet mono voice (v3: lowercase, no tracking);
          the group carries the accessible name */}
      <span aria-hidden="true" className="text-xs text-mist-dim">
        {t('generator.model.label')}
      </span>
      <div role="group" aria-label={t('generator.model.label')} className="grid grid-cols-2 gap-2">
        {models.map((model) => {
          const isSelected = model.id === selectedId
          return (
            // Terminal catalog card: selection glows in the AMBER specimen
            // tint — the reference explicitly files "model picker highlights"
            // under amber; unselected cards are quiet white/10 hairlines that
            // step toward ridge on hover. Never a solid fill.
            <button
              key={model.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelect(model.id)}
              className={`flex flex-col items-start gap-0.5 rounded-lg border p-3 text-left transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none ${
                isSelected
                  ? 'border-glow-amber/60 bg-specimen-amber/20'
                  : 'border-white/10 bg-transparent hover:border-white/25 hover:bg-ridge/40'
              }`}
            >
              {/* The product name — font-medium (500) is the weight ceiling */}
              <span className="text-base leading-tight font-medium text-white">{model.name}</span>
              {/* Honest provider attribution — users see what actually runs */}
              <span className="text-xs text-mist-dim">{model.providerLabel}</span>
              <span
                className={`text-xs font-medium ${isSelected ? 'text-glow-amber' : 'text-mist-dim'}`}
              >
                {priceHint(model, t)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
