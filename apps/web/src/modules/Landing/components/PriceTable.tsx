// apps/web/src/modules/Landing/components/PriceTable.tsx
// "The index" — the honest price comparison as a mono terminal table (v3
// Stage 2): white/10 hairline rules on the void instead of a card, mono
// weight-400 numerals, OUR column glowing green (green = "go/us" in the
// triad; the comparison still stays visually even), and the verification date
// as a PORTAL-BLUE footnote (the sanctioned prose accent — the honesty marker
// deserves the one prose highlight). Our column vs ONE named competitor item
// per row, never a blanket "cheaper than everything" claim. The <caption>
// stays the table's accessible name on purpose, so the honesty marker is
// announced before any number.
import { useTranslation } from 'react-i18next'
import { PRICE_COMPARISON_ROWS, formatUsd } from '../model/pricingData'
import { SectionHeading } from './SectionHeading'

// Column headers in the quiet mono caption voice (v3: lowercase, no tracking)
const columnHeaderClass = 'py-3 pr-4 text-xs font-normal'

export function PriceTable() {
  const { t } = useTranslation()

  return (
    <section className="flex flex-col gap-8">
      <SectionHeading kicker={t('landing.price.kicker')} title={t('landing.price.title')} />
      {/* Horizontal scroll instead of squashing on phones — the page itself
          never scrolls sideways (brief QA #5) */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-left">
          {/* caption-bottom = the verification footnote; still the table's
              accessible name (tests query the table BY this honesty marker).
              Portal blue: the one prose accent marks the honesty line. */}
          <caption className="caption-bottom border-t border-white/10 pt-3 text-left text-xs text-portal">
            {t('landing.price.caption', { date: t('landing.price.date') })}
          </caption>
          <thead>
            <tr>
              <th scope="col" className={`${columnHeaderClass} text-mist-dim`}>
                {t('landing.price.columns.useCase')}
              </th>
              {/* The portal "us" column header — the prose accent marks our
                  column without borrowing a status color at caption size */}
              <th scope="col" className={`${columnHeaderClass} px-4 text-portal`}>
                {t('landing.price.columns.ours')}
              </th>
              <th scope="col" className={`${columnHeaderClass} px-4 text-mist-dim`}>
                {t('landing.price.columns.competitor')}
              </th>
            </tr>
          </thead>
          <tbody>
            {PRICE_COMPARISON_ROWS.map((row) => (
              <tr key={row.id} className="border-t border-white/10 align-baseline">
                <th scope="row" className="py-5 pr-4 text-sm font-medium text-mist">
                  {t(`landing.price.rows.${row.id}.useCase`)}
                </th>
                {/* Our column: mono weight-400 numeral in glow-green — the
                    triad's "go" color says "ours/cheaper" while the model
                    label stays dimmed mist (status glows never carry prose) */}
                <td className="px-4 py-5">
                  <span className="block text-2xl font-normal text-glow-green md:text-3xl">
                    {formatUsd(row.ourPriceUsd)}
                  </span>
                  <span className="mt-1 block text-xs text-mist-dim">
                    {t(`landing.price.rows.${row.id}.ourModel`)}
                  </span>
                </td>
                {/* Competitor column: same mono numeral in white — an even,
                    honest comparison, differentiated by color only in OUR favor */}
                <td className="px-4 py-5">
                  <span className="block text-2xl font-normal text-white md:text-3xl">
                    {formatUsd(row.competitorPriceUsd)}
                  </span>
                  <span className="mt-1 block text-xs text-mist-dim">
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
