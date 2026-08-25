// apps/web/src/modules/Analytics/components/MyUsage.tsx
// "What did I spend it on" — the user-facing half of analytics.
//
// Credits only. There is no provider cost or margin anywhere in this component,
// and there CANNOT be: the MeUsage contract it renders has no field for one
// (ADR §6). That is the guarantee — not this comment.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, ErrorState, PillGroup, Skeleton } from 'shared/ui'
import { useMyUsage, WINDOW_OPTIONS, type WindowDays } from '../model/analyticsApi'
import { formatInt, formatPercent, healthTone } from '../model/format'
import { DataTable, MiniBars, Stat, StatRow } from './parts'

export function MyUsage() {
  const { t } = useTranslation()
  const [days, setDays] = useState<WindowDays>(30)
  const usage = useMyUsage(days)

  if (usage.isPending) return <Skeleton className="h-64 w-full" />
  if (usage.error) {
    return <ErrorState message={t('analytics.errorBody')} onRetry={() => void usage.refetch()} />
  }

  const data = usage.data
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">{t('analytics.usage.title')}</h2>
        <PillGroup
          label={t('analytics.windowLabel')}
          value={days}
          onChange={setDays}
          options={WINDOW_OPTIONS.map((d) => ({
            value: d,
            label: t('analytics.window', { count: d }),
          }))}
        />
      </div>

      <Card padding="md">
        <StatRow>
          <Stat label={t('analytics.usage.balance')} value={formatInt(data.balance)} />
          <Stat label={t('analytics.usage.spent')} value={formatInt(data.creditsSpent)} />
          <Stat
            label={t('analytics.usage.refunded')}
            value={formatInt(data.creditsRefunded)}
            // Refunds are the money back from generations that failed. Shown
            // because a user who sees a charge disappear deserves the reason.
            hint={t('analytics.usage.refundedHint')}
          />
          <Stat
            label={t('analytics.health.successRate')}
            value={formatPercent(data.generations.successRate)}
            tone={healthTone(data.generations.successRate)}
          />
        </StatRow>
      </Card>

      <Card title={t('analytics.usage.byDay')} padding="md">
        {data.byDay.length === 0 ? (
          <p className="py-6 text-center text-sm text-mist-dim">{t('analytics.empty')}</p>
        ) : (
          <MiniBars
            data={data.byDay.map((d) => ({
              label: d.date.slice(5),
              value: d.creditsNet,
              caption: `${d.generations}×`,
            }))}
            format={formatInt}
          />
        )}
      </Card>

      <DataTable
        title={t('analytics.usage.byType')}
        headers={[
          t('analytics.usage.type'),
          t('analytics.money.runs'),
          t('analytics.health.failed'),
          t('analytics.money.credits'),
        ]}
        emptyLabel={t('analytics.empty')}
        rows={data.byType.map((r) => ({
          key: r.type,
          cells: [
            t(`analytics.usage.types.${r.type}`, { defaultValue: r.type }),
            formatInt(r.total),
            formatInt(r.failed),
            formatInt(r.creditsNet),
          ],
        }))}
      />
    </div>
  )
}
