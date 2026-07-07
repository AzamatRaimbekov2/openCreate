// apps/web/src/modules/Landing/components/ModelCreditTable.tsx
// Full per-model credit table for the /pricing page. Purely presentational:
// the ROUTE owns the catalog query (and its 4 states) and hands the models in,
// so this module never grows data-fetching logic that belongs elsewhere.
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import type { CatalogModel } from '@opencreate/contracts'
import { CREDIT_USD, formatUsd } from '../model/pricingData'
import { TableScrollRegion } from './TableScrollRegion'

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

// Column headers in the index's quiet mono caption voice (v3: lowercase)
const columnHeaderClass = 'py-3 pr-4 text-xs font-normal text-mist-dim'

export function ModelCreditTable({ models }: ModelCreditTableProps) {
  const { t } = useTranslation()

  return (
    // Index treatment (v3): white/10 hairline rules directly on the void —
    // horizontal scroll keeps four readable columns on phones, and the
    // TableScrollRegion wrapper adds the no-gradient "scroll →" hint +
    // keyboard focus for the overflow area (v4 QA round 2)
    <TableScrollRegion label={t('pricing.models.title')}>
      <table
        aria-label={t('pricing.models.title')}
        className="w-full min-w-[36rem] border-collapse border-b border-white/10 text-left text-sm"
      >
        <thead>
          <tr>
            <th scope="col" className={columnHeaderClass}>
              {t('pricing.models.model')}
            </th>
            <th scope="col" className={`${columnHeaderClass} px-4`}>
              {t('pricing.models.type')}
            </th>
            <th scope="col" className={`${columnHeaderClass} px-4`}>
              {t('pricing.models.credits')}
            </th>
            <th scope="col" className={`${columnHeaderClass} px-4`}>
              {t('pricing.models.price')}
            </th>
          </tr>
        </thead>
        <tbody>
          {models.map((model) => (
            <tr key={model.id} className="border-t border-white/10 align-baseline">
              <th scope="row" className="py-4 pr-4">
                <span className="block font-medium text-white">{model.name}</span>
                {/* Honest provider label — the real model behind our name */}
                <span className="block text-xs font-normal text-mist-dim">
                  {model.providerLabel}
                </span>
              </th>
              <td className="px-4 py-4 text-mist-dim">{t(`generator.type.${model.type}`)}</td>
              {/* Credits are the index's numerals — mono weight-400 in
                  SPECIMEN GREEN (Stage 2): our credit prices are the "go/us"
                  numbers, same glow the comparison table gives OUR column */}
              <td className="px-4 py-4 text-lg font-normal text-glow-green">
                {creditsLabel(model, t)}
              </td>
              <td className="px-4 py-4 text-mist-dim">{usdLabel(model, t)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScrollRegion>
  )
}
