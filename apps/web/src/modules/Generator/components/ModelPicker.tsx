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
      {/* Visible caption in the editorial micro-label voice (uppercase is
          CSS-only); the group carries the accessible name */}
      <span
        aria-hidden="true"
        className="text-[11px] font-medium tracking-[0.18em] text-ink-soft uppercase"
      >
        {t('generator.model.label')}
      </span>
      <div role="group" aria-label={t('generator.model.label')} className="grid grid-cols-2 gap-2">
        {models.map((model) => {
          const isSelected = model.id === selectedId
          return (
            // Editorial catalog card: a hairline frame on the cream paper —
            // the serif name reads like a specimen entry; selection is the
            // vermillion hairline + sand wash (active state = sanctioned accent)
            <button
              key={model.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelect(model.id)}
              className={`flex flex-col items-start gap-0.5 rounded-sm border p-3 text-left transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-vermillion focus-visible:outline-none ${
                isSelected
                  ? 'border-vermillion bg-sand'
                  : 'border-ink/15 bg-transparent hover:border-ink/40 hover:bg-sand/60'
              }`}
            >
              {/* Display serif for the product name — the card's "headline" */}
              <span className="font-display text-base leading-tight font-semibold tracking-tight text-ink">
                {model.name}
              </span>
              {/* Honest provider attribution — users see what actually runs */}
              <span className="text-xs text-ink-soft">{model.providerLabel}</span>
              <span
                className={`text-xs font-medium ${isSelected ? 'text-vermillion' : 'text-ink-soft'}`}
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
