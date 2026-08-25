// apps/web/src/modules/Analytics/components/HealthPanel.tsx
// "What is broken right now." Ordered by what an operator opens this page for:
// stranded jobs first (they may owe a refund), then the model breakdown worst-
// first, then a sample of the actual error text — which is the thing that tells
// you WHICH failure it is, and the reason this panel exists instead of a graph.
import { useTranslation } from 'react-i18next'
import type { AdminHealth } from '@opencreate/contracts'
import { Badge, Card } from 'shared/ui'
import { formatDuration, formatInt, formatPercent, healthTone } from '../model/format'
import { DataTable, Stat, StatRow } from './parts'

export function HealthPanel({ data }: { data: AdminHealth }) {
  const { t } = useTranslation()
  const g = data.generations

  return (
    <div className="flex flex-col gap-4">
      <Card title={t('analytics.health.totals')} padding="md">
        <StatRow>
          <Stat label={t('analytics.health.total')} value={formatInt(g.total)} />
          <Stat
            label={t('analytics.health.successRate')}
            value={formatPercent(g.successRate)}
            tone={healthTone(g.successRate)}
            // Says WHY it is an em-dash, so "unknown" never reads as a bug.
            hint={g.successRate === null ? t('analytics.health.nothingSettled') : undefined}
          />
          <Stat label={t('analytics.health.failed')} value={formatInt(g.failed)} />
          <Stat label={t('analytics.health.processing')} value={formatInt(g.processing)} />
        </StatRow>
        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-white/10 pt-4">
          <Stat
            label={t('analytics.health.filmRenders')}
            value={`${formatInt(data.filmRenders.total)} · ${formatPercent(data.filmRenders.successRate)}`}
            tone={healthTone(data.filmRenders.successRate)}
          />
          <Stat
            label={t('analytics.health.modelRenders')}
            value={`${formatInt(data.modelRenders.total)} · ${formatPercent(data.modelRenders.successRate)}`}
            tone={healthTone(data.modelRenders.successRate)}
          />
        </div>
      </Card>

      {/* Stranded jobs lead, and only render when there ARE any: a permanently
          visible "0 stuck" card trains the eye to skip the row where the real
          number will one day appear. */}
      {data.stuck.length > 0 ? (
        <DataTable
          title={t('analytics.health.stuckTitle')}
          headers={[
            t('analytics.health.model'),
            t('analytics.health.provider'),
            t('analytics.health.age'),
          ]}
          emptyLabel=""
          rows={data.stuck.map((j) => ({
            key: j.id,
            cells: [
              j.modelId,
              j.provider,
              <span key="age" className="text-rose-300">
                {formatDuration(j.ageMinutes * 60_000)}
              </span>,
            ],
          }))}
        />
      ) : null}

      <DataTable
        title={t('analytics.health.byModel')}
        headers={[
          t('analytics.health.model'),
          t('analytics.health.provider'),
          t('analytics.health.total'),
          t('analytics.health.failed'),
          t('analytics.health.median'),
          t('analytics.health.successRate'),
        ]}
        emptyLabel={t('analytics.empty')}
        rows={data.byModel.map((m) => ({
          key: `${m.modelId}:${m.provider}:${m.type}`,
          cells: [
            m.modelId,
            m.provider,
            formatInt(m.total),
            formatInt(m.failed),
            formatDuration(m.medianDurationMs),
            <Badge
              key="rate"
              variant={
                healthTone(m.successRate) === 'good'
                  ? 'success'
                  : healthTone(m.successRate) === 'bad'
                    ? 'danger'
                    : 'neutral'
              }
            >
              {formatPercent(m.successRate)}
            </Badge>,
          ],
        }))}
      />

      <DataTable
        title={t('analytics.health.recentFailures')}
        headers={[
          t('analytics.health.model'),
          t('analytics.health.code'),
          t('analytics.health.message'),
        ]}
        emptyLabel={t('analytics.health.noFailures')}
        rows={data.recentFailures.map((f) => ({
          key: f.id,
          cells: [
            f.modelId,
            f.errorCode ?? '—',
            // The provider's own words, untruncated by CSS: this string is the
            // difference between "wrong model id" and "the account never
            // activated this model", which is the whole diagnostic value here.
            <span key="msg" className="whitespace-pre-wrap break-words text-mist-dim">
              {f.errorMessage ?? '—'}
            </span>,
          ],
        }))}
      />
    </div>
  )
}
