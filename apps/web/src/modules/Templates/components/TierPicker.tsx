// apps/web/src/modules/Templates/components/TierPicker.tsx
// The price/quality choice — the single most consequential control in this module,
// which is why it is not a PillGroup.
//
// A PillGroup pill holds one label. This choice needs four facts per option
// (name, model, credits, and what the tier buys you that the cheaper one doesn't),
// and one of them — "can you actually afford this?" — has to be answered BEFORE
// the click, not after. A template runs 448 to 1120 credits: a user who picks
// premium with 300 credits in the bank would build a nine-shot film they cannot
// generate a single beat of, and would find out one shot at a time.
//
// So: a radiogroup of rows. Unaffordable tiers stay visible (the price is the
// information) but are disabled and say why. The shared amber selection tint and
// the hairline/ridge hover of PillGroup are preserved so it still reads as part of
// the same kit.
import { useTranslation } from 'react-i18next'
import type { TemplateTier, TemplateTierOffer } from '@opencreate/contracts'

export type TierPickerProps = {
  offers: TemplateTierOffer[]
  value: TemplateTier
  onChange: (tier: TemplateTier) => void
  // The caller's balance, or undefined while it loads. Undefined disables NO tier:
  // a slow /api/me must never make the product look like it is out of stock.
  balance: number | undefined
}

export function TierPicker({ offers, value, onChange, balance }: TierPickerProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-2">
      <span aria-hidden="true" className="text-xs text-mist-dim">
        {t('templates.tier.label')}
      </span>
      <div role="radiogroup" aria-label={t('templates.tier.label')} className="flex flex-col gap-2">
        {offers.map((offer) => {
          const isSelected = offer.tier === value
          const canAfford = balance === undefined || balance >= offer.credits

          return (
            <button
              key={offer.tier}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={!canAfford}
              onClick={() => onChange(offer.tier)}
              className={`flex items-start justify-between gap-4 rounded-xl border px-4 py-3 text-left transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none ${
                isSelected
                  ? 'border-white/10 bg-specimen-amber/20'
                  : 'border-white/10 bg-transparent hover:bg-ridge'
              } ${canAfford ? '' : 'cursor-not-allowed opacity-40'}`}
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span
                  className={`text-sm font-medium ${isSelected ? 'text-lumen-amber' : 'text-mist'}`}
                >
                  {t(`templates.tier.${offer.tier}`)}
                </span>
                {/* The model is the honest answer to "what am I paying for" */}
                <span className="text-xs text-mist-dim">{offer.modelName}</span>
                {/* Why this tier costs more, when the number alone doesn't say it.
                    On premium this is "the characters speak" — which is the whole
                    reason the format works, not an upsell. */}
                {offer.note ? (
                  <span className="mt-1 text-xs text-lumen-amber/80">{offer.note}</span>
                ) : null}
              </span>

              <span className="flex shrink-0 flex-col items-end gap-0.5">
                <span
                  className={`text-sm tabular-nums ${isSelected ? 'text-lumen-amber' : 'text-mist'}`}
                >
                  {t('templates.tier.credits', { count: offer.credits })}
                </span>
                {canAfford ? null : (
                  <span className="text-xs text-glow-red">{t('templates.tier.tooExpensive')}</span>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
