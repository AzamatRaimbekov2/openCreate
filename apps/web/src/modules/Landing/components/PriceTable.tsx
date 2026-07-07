// apps/web/src/modules/Landing/components/PriceTable.tsx
// Honest price comparison: our column vs ONE named competitor item per row,
// never a blanket "cheaper than everything" claim. The <caption> carries the
// verification date — it is the table's accessible name on purpose, so the
// honesty marker is announced before any number.
import { useTranslation } from 'react-i18next'
import { PRICE_COMPARISON_ROWS, formatUsd } from '../model/pricingData'

export function PriceTable() {
  const { t } = useTranslation()

  return (
    <section className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold text-ink">{t('landing.price.title')}</h2>
      {/* White card on the cream canvas; horizontal scroll instead of squashing on phones */}
      <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
        <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
          <caption className="mb-4 text-left text-xs text-ink-soft">
            {t('landing.price.caption', { date: t('landing.price.date') })}
          </caption>
          <thead>
            <tr className="text-xs text-ink-soft">
              <th scope="col" className="py-2 pr-4 font-medium">
                {t('landing.price.columns.useCase')}
              </th>
              {/* Our column header pops in vermillion — the only colored header */}
              <th scope="col" className="px-4 py-2 font-semibold text-vermillion">
                {t('landing.price.columns.ours')}
              </th>
              <th scope="col" className="px-4 py-2 font-medium">
                {t('landing.price.columns.competitor')}
              </th>
            </tr>
          </thead>
          <tbody>
            {PRICE_COMPARISON_ROWS.map((row) => (
              <tr key={row.id} className="border-t border-ink/10 align-top">
                <th scope="row" className="py-3 pr-4 font-medium text-ink">
                  {t(`landing.price.rows.${row.id}.useCase`)}
                </th>
                {/* Our cell is washed sand; ONLY text-vermillion may sit on
                    it (design.md §7 contrast rule) */}
                <td className="bg-sand px-4 py-3 text-vermillion">
                  <span className="block font-semibold">{formatUsd(row.ourPriceUsd)}</span>
                  <span className="block text-xs">{t(`landing.price.rows.${row.id}.ourModel`)}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="block font-medium text-ink">
                    {formatUsd(row.competitorPriceUsd)}
                  </span>
                  <span className="block text-xs text-ink-soft">
                    {t(`landing.price.rows.${row.id}.competitorItem`)} ·{' '}
                    {t(`landing.price.rows.${row.id}.competitorNote`)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
