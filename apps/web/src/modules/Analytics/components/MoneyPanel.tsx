// apps/web/src/modules/Analytics/components/MoneyPanel.tsx
// "What did it cost and what did we earn."
//
// This panel carries the two honesty constraints from the ADR, and they are the
// reason it is not just four numbers in a row:
//
//   §3  Provider cost is BILLED or MISSING, never estimated into the same figure.
//       Segmind reports nothing, so the unpriced count sits next to the total.
//   §4  Without CREDIT_PRICE_USD the margin block refuses to render numbers and
//       says what is missing instead — a margin of $0 and a margin of "unknown"
//       must not look alike.
import { useTranslation } from 'react-i18next'
import type { AdminMoney } from '@opencreate/contracts'
import { Card } from 'shared/ui'
import { formatInt, formatPercentPoints, formatUsd } from '../model/format'
import { DataTable, MiniBars, Stat, StatRow } from './parts'

// Rendered whenever a figure is short by an unknown amount. Not a toast and not
// a tooltip: the caveat has to be visible at the same moment as the number it
// qualifies, or the number gets quoted without it.
function UnpricedNotice({ count }: { count: number }) {
  const { t } = useTranslation()
  if (count === 0) return null
  return (
    <p className="mt-3 rounded-md border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-xs text-amber-200">
      {t('analytics.money.unpricedNotice', { count })}
    </p>
  )
}

function MarginBlock({ data }: { data: AdminMoney }) {
  const { t } = useTranslation()
  const m = data.margin

  if (m.creditPriceUsd === null) {
    return (
      <Card title={t('analytics.money.marginTitle')} padding="md">
        <p className="text-sm text-mist-dim">{t('analytics.money.marginUnconfigured')}</p>
        <code className="mt-2 block rounded bg-white/5 px-2 py-1 text-xs text-cyan-200">
          CREDIT_PRICE_USD=0.02
        </code>
      </Card>
    )
  }

  return (
    <Card title={t('analytics.money.marginTitle')} padding="md">
      <StatRow>
        <Stat label={t('analytics.money.revenue')} value={formatUsd(m.revenueUsd)} />
        <Stat label={t('analytics.money.billed')} value={formatUsd(data.cost.billedUsd)} />
        <Stat
          label={t('analytics.money.margin')}
          value={formatUsd(m.marginUsd)}
          tone={m.marginUsd !== null && m.marginUsd < 0 ? 'bad' : 'good'}
        />
        <Stat label={t('analytics.money.marginPercent')} value={formatPercentPoints(m.marginPercent)} />
      </StatRow>
      {/* The rate is an operator's ASSUMPTION, not a fact the system knows —
          credits are not sold anywhere yet. Printing it under the numbers is what
          keeps the figure above from being quoted as revenue. */}
      <p className="mt-3 text-xs text-mist-dim">
        {t('analytics.money.rateAssumption', { rate: m.creditPriceUsd })}
      </p>
      <UnpricedNotice count={data.cost.unpricedCount} />
    </Card>
  )
}

export function MoneyPanel({ data }: { data: AdminMoney }) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-4">
      <Card title={t('analytics.money.totals')} padding="md">
        <StatRow>
          <Stat label={t('analytics.money.charged')} value={formatInt(data.creditsCharged)} />
          <Stat label={t('analytics.money.refunded')} value={formatInt(data.creditsRefunded)} />
          <Stat
            label={t('analytics.money.net')}
            value={formatInt(data.creditsNet)}
            hint={t('analytics.money.netHint')}
          />
          <Stat
            label={t('analytics.money.billed')}
            value={formatUsd(data.cost.billedUsd)}
            hint={t('analytics.money.pricedOf', {
              priced: data.cost.pricedCount,
              total: data.cost.pricedCount + data.cost.unpricedCount,
            })}
          />
        </StatRow>
        <UnpricedNotice count={data.cost.unpricedCount} />
      </Card>

      <MarginBlock data={data} />

      <Card title={t('analytics.money.byDay')} padding="md">
        {data.byDay.length === 0 ? (
          <p className="py-6 text-center text-sm text-mist-dim">{t('analytics.empty')}</p>
        ) : (
          <MiniBars
            data={data.byDay.map((d) => ({
              label: d.date.slice(5),
              value: d.billedUsd,
              caption: `${d.generations}×`,
            }))}
            format={(n) => formatUsd(n)}
          />
        )}
      </Card>

      <DataTable
        title={t('analytics.money.byModel')}
        headers={[
          t('analytics.health.model'),
          t('analytics.health.provider'),
          t('analytics.money.runs'),
          t('analytics.money.credits'),
          t('analytics.money.billed'),
          t('analytics.money.unpriced'),
        ]}
        emptyLabel={t('analytics.empty')}
        rows={data.byModel.map((m) => ({
          key: `${m.modelId}:${m.provider}`,
          cells: [
            m.modelId,
            m.provider,
            formatInt(m.count),
            formatInt(m.creditsNet),
            formatUsd(m.billedUsd),
            // Amber, because a non-zero here means this row's billed figure is
            // short by an unknown amount — the per-model version of the notice.
            m.unpricedCount > 0 ? (
              <span key="u" className="text-amber-300">
                {formatInt(m.unpricedCount)}
              </span>
            ) : (
              '—'
            ),
          ],
        }))}
      />
    </div>
  )
}
