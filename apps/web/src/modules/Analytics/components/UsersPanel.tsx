// apps/web/src/modules/Analytics/components/UsersPanel.tsx
// "Who uses it and how much." The one panel that shows other people's email
// addresses, which is why it lives behind the same server-side role check as the
// money one and is never rendered for a non-admin.
import { useTranslation } from 'react-i18next'
import type { AdminUsers } from '@opencreate/contracts'
import { Card } from 'shared/ui'
import { formatInt } from '../model/format'
import { DataTable, MiniBars, Stat, StatRow } from './parts'

export function UsersPanel({ data }: { data: AdminUsers }) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-4">
      <Card title={t('analytics.users.totals')} padding="md">
        <StatRow>
          <Stat label={t('analytics.users.total')} value={formatInt(data.totalUsers)} />
          <Stat label={t('analytics.users.new')} value={formatInt(data.newUsers)} />
          <Stat
            label={t('analytics.users.active')}
            value={formatInt(data.activeUsers)}
            // "Active" is not sign-ins — nothing records those. It is people who
            // generated something, which is the number that costs money anyway.
            hint={t('analytics.users.activeHint')}
          />
          <Stat
            label={t('analytics.users.generations')}
            value={formatInt(data.byDay.reduce((sum, d) => sum + d.generations, 0))}
          />
        </StatRow>
      </Card>

      <Card title={t('analytics.users.byDay')} padding="md">
        {data.byDay.length === 0 ? (
          <p className="py-6 text-center text-sm text-mist-dim">{t('analytics.empty')}</p>
        ) : (
          <MiniBars
            data={data.byDay.map((d) => ({
              label: d.date.slice(5),
              value: d.generations,
              caption: t('analytics.users.signupsShort', { count: d.signups }),
            }))}
            format={formatInt}
          />
        )}
      </Card>

      <Card title={t('analytics.users.bySurface')} padding="md">
        {data.bySurface.length === 0 ? (
          <p className="py-6 text-center text-sm text-mist-dim">{t('analytics.empty')}</p>
        ) : (
          <MiniBars
            data={data.bySurface.map((s) => ({ label: s.surface, value: s.count }))}
            format={formatInt}
          />
        )}
      </Card>

      <DataTable
        title={t('analytics.users.top')}
        headers={[
          t('analytics.users.email'),
          t('analytics.users.generations'),
          t('analytics.money.credits'),
        ]}
        emptyLabel={t('analytics.empty')}
        rows={data.topUsers.map((u) => ({
          key: u.id,
          cells: [u.email, formatInt(u.generations), formatInt(u.creditsNet)],
        }))}
      />
    </div>
  )
}
