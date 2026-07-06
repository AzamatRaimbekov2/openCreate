// apps/web/src/modules/Landing/components/ModelCreditTable.tsx
// Full per-model credit table for the /pricing page. Purely presentational:
// the ROUTE owns the catalog query (and its 4 states) and hands the models in,
// so this module never grows data-fetching logic that belongs elsewhere.
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import type { CatalogModel } from '@opencreate/contracts'
import { CREDIT_USD, formatUsd } from '../model/pricingData'

export type ModelCreditTableProps = {
  // Catalog models in the API's display order (image + video)
  models: CatalogModel[]
}

// "1 · per image" for flat-priced images, "5s — 35 · 8s — 56" for videos
function creditsLabel(model: CatalogModel, t: TFunction): string {
  if (model.type === 'image') {
    return `${model.credits} · ${t('pricing.models.perImage')}`
  }
  return model.durationOptions
    .map(
      (duration) =>
        // Record access can be undefined under noUncheckedIndexedAccess —
        // an em-dash placeholder beats rendering the string "undefined"
        `${t('pricing.models.duration', { count: duration })} — ${
          model.creditsByDuration[String(duration)] ?? '—'
        }`,
    )
    .join(' · ')
}

// Flat USD for images; the cheapest duration as a "from" price for videos
function usdLabel(model: CatalogModel, t: TFunction): string {
  if (model.type === 'image') {
    return formatUsd(model.credits * CREDIT_USD)
  }
  const cheapest = Math.min(...Object.values(model.creditsByDuration))
  return t('pricing.models.from', { price: formatUsd(cheapest * CREDIT_USD) })
}

export function ModelCreditTable({ models }: ModelCreditTableProps) {
  const { t } = useTranslation()

  return (
    <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
      <table
        aria-label={t('pricing.models.title')}
        className="w-full min-w-[36rem] border-collapse text-left text-sm"
      >
        <thead>
          <tr className="text-xs text-ink-soft">
            <th scope="col" className="py-2 pr-4 font-medium">
              {t('pricing.models.model')}
            </th>
            <th scope="col" className="px-4 py-2 font-medium">
              {t('pricing.models.type')}
            </th>
            <th scope="col" className="px-4 py-2 font-medium">
              {t('pricing.models.credits')}
            </th>
            <th scope="col" className="px-4 py-2 font-medium">
              {t('pricing.models.price')}
            </th>
          </tr>
        </thead>
        <tbody>
          {models.map((model) => (
            <tr key={model.id} className="border-t border-ink/10 align-top">
              <th scope="row" className="py-3 pr-4">
                <span className="block font-medium text-ink">{model.name}</span>
                {/* Honest provider label — the real model behind our name */}
                <span className="block text-xs font-normal text-ink-soft">
                  {model.providerLabel}
                </span>
              </th>
              <td className="px-4 py-3 text-ink-soft">{t(`generator.type.${model.type}`)}</td>
              <td className="px-4 py-3 font-medium text-ink">{creditsLabel(model, t)}</td>
              <td className="px-4 py-3 text-ink-soft">{usdLabel(model, t)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
