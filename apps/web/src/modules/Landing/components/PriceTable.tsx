// apps/web/src/modules/Landing/components/PriceTable.tsx
// "The index" — the honest price comparison as an editorial index table:
// hairline rules instead of a card, serif display numerals, the vermillion
// openCreate column, and the verification date as a footnote. Our column vs
// ONE named competitor item per row, never a blanket "cheaper than
// everything" claim. The <caption> stays the table's accessible name on
// purpose, so the honesty marker is announced before any number.
import { useTranslation } from 'react-i18next'
import { PRICE_COMPARISON_ROWS, formatUsd } from '../model/pricingData'
import { SectionHeading } from './SectionHeading'

export type PriceTableProps = {
  // Magazine ordinal of the section — the landing runs it as 02 (after the
  // showcase), the /pricing page as its opening 01 section
  ordinal?: string
}

// Column headers share the micro-label voice of the index (uppercase via CSS)
const columnHeaderClass = 'py-3 pr-4 text-[11px] font-medium tracking-[0.18em] uppercase'

export function PriceTable({ ordinal = '01' }: PriceTableProps) {
  const { t } = useTranslation()

  return (
    <section className="flex flex-col gap-8">
      <SectionHeading
        ordinal={ordinal}
        kicker={t('landing.price.kicker')}
        title={t('landing.price.title')}
      />
      {/* Horizontal scroll instead of squashing on phones — the page itself
          never scrolls sideways (brief QA #5) */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-left">
          {/* caption-bottom = the verification footnote; still the table's
              accessible name (tests query the table BY this honesty marker) */}
          <caption className="caption-bottom border-t border-ink/15 pt-3 text-left text-xs text-ink-soft">
            {t('landing.price.caption', { date: t('landing.price.date') })}
          </caption>
          <thead>
            <tr>
              <th scope="col" className={`${columnHeaderClass} text-ink-soft`}>
                {t('landing.price.columns.useCase')}
              </th>
              {/* The vermillion "us" column header — the index's one accent
                  column (brief-sanctioned micro-label use, design.md §2) */}
              <th scope="col" className={`${columnHeaderClass} px-4 text-vermillion`}>
                {t('landing.price.columns.ours')}
              </th>
              <th scope="col" className={`${columnHeaderClass} px-4 text-ink-soft`}>
                {t('landing.price.columns.competitor')}
              </th>
            </tr>
          </thead>
          <tbody>
            {PRICE_COMPARISON_ROWS.map((row) => (
              <tr key={row.id} className="border-t border-ink/15 align-baseline">
                <th scope="row" className="py-5 pr-4 text-sm font-medium text-ink">
                  {t(`landing.price.rows.${row.id}.useCase`)}
                </th>
                {/* Our column: serif display numeral in vermillion (large bold
                    text — the sanctioned use); the model label stays ink-soft
                    so no small vermillion text ships (design.md §2) */}
                <td className="px-4 py-5">
                  <span className="block font-display text-2xl font-semibold tracking-tight text-vermillion md:text-3xl">
                    {formatUsd(row.ourPriceUsd)}
                  </span>
                  <span className="mt-1 block text-xs text-ink-soft">
                    {t(`landing.price.rows.${row.id}.ourModel`)}
                  </span>
                </td>
                {/* Competitor column: same serif numeral in ink — an even,
                    honest comparison, differentiated by color only in OUR favor */}
                <td className="px-4 py-5">
                  <span className="block font-display text-2xl font-semibold tracking-tight text-ink md:text-3xl">
                    {formatUsd(row.competitorPriceUsd)}
                  </span>
                  <span className="mt-1 block text-xs text-ink-soft">
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
