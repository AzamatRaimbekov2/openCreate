// apps/web/src/modules/Cinema/components/ModelPickerModal.tsx
// The composer's model picker, as a BIG modal instead of a rail Select (owner
// request 2026-07-15): a video model is a real purchasing decision — brand,
// tier, honest provider label, one-line description and the tariff all belong
// on the table at once, and a 22rem listbox panel cramped them. The rows reuse
// the same presentation sources the Generator's select reads (shared/libs
// modelPresentation + shared/ui ProviderMark — moved to shared exactly so both
// modules can, since modules must not import each other).
//
// Picking a row commits AND closes — the dialog is a question, not a workspace.
import { useTranslation } from 'react-i18next'
import type { CatalogVideoModel } from '@opencreate/contracts'
import { presentationFor, tariffFor } from 'shared/libs/modelPresentation'
import { Modal, ProviderMark } from 'shared/ui'

export type ModelPickerModalProps = {
  isOpen: boolean
  onClose: () => void
  // Video models offered (from the catalog, via the route seam)
  models: CatalogVideoModel[]
  // The currently chosen model id (amber ring on its row)
  value: string
  // Commit a chosen model id
  onChange: (modelId: string) => void
}

export function ModelPickerModal({ isOpen, onClose, models, value, onChange }: ModelPickerModalProps) {
  const { t } = useTranslation()

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('cinema.inspector.model')} size="lg">
      <ul className="flex max-h-[60svh] flex-col gap-2 overflow-y-auto">
        {models.map((model) => {
          const { provider, descriptionKey } = presentationFor(model.id)
          const tariff = tariffFor(model)
          const isSelected = model.id === value
          return (
            <li key={model.id}>
              <button
                type="button"
                aria-pressed={isSelected}
                onClick={() => {
                  onChange(model.id)
                  onClose()
                }}
                // Amber marks the chosen row — the kit's selection language
                className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors duration-200 hover:bg-ridge focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none ${
                  isSelected
                    ? 'border-glow-amber/60 bg-white/5 ring-1 ring-glow-amber/40'
                    : 'border-white/10'
                }`}
              >
                {/* Brand mark in a steel tile — same anatomy as the select's rich row */}
                <span
                  className={`grid size-11 shrink-0 place-items-center rounded-lg border border-white/10 bg-steel ${
                    isSelected ? 'text-glow-amber' : 'text-mist'
                  }`}
                >
                  <ProviderMark provider={provider} className="size-6" />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-white">{model.name}</span>
                    {/* Tier chip at the row's own type scale (see Select's Row) */}
                    <span className="shrink-0 rounded-full border border-white/10 px-1.5 text-[10px] leading-4 text-portal">
                      {t(`generator.tier.${model.tier}`)}
                    </span>
                  </span>
                  {/* Honest provider attribution — users see what actually runs */}
                  <span className="block truncate text-xs text-mist-dim">{model.providerLabel}</span>
                  <span className="mt-1 block text-xs text-mist-dim">{t(descriptionKey)}</span>
                </span>

                {/* Base tariff, one comparable number per model */}
                <span className="shrink-0 text-xs font-medium text-mist">
                  {t('generator.model.tariff', { credits: tariff.credits, dollars: tariff.dollars })}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </Modal>
  )
}
