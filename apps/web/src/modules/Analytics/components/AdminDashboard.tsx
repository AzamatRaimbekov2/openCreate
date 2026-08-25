// apps/web/src/modules/Analytics/components/AdminDashboard.tsx
// The /admin screen. Composition only — every number is decided in the read
// model on the server, and every "unknown" is decided in format.ts.
//
// THE FOUR STATES ARE NOT OPTIONAL HERE, and one of them is unusual: a 403.
// Hiding the nav link never stopped anyone typing the URL, so a non-admin who
// arrives is told plainly that this account is not enough — not bounced to a
// sign-in screen they are already past.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ErrorState, PillGroup, Skeleton } from 'shared/ui'
import { ApiClientError } from 'shared/libs/apiClient'
import { useAdminHealth, useAdminMoney, useAdminUsers, WINDOW_OPTIONS, type WindowDays } from '../model/analyticsApi'
import { HealthPanel } from './HealthPanel'
import { MoneyPanel } from './MoneyPanel'
import { UsersPanel } from './UsersPanel'

const TABS = ['health', 'money', 'users'] as const
type Tab = (typeof TABS)[number]

export type AdminDashboardProps = {
  // From /api/me. The server re-reads the role on every request, so this only
  // decides whether to FIRE the queries — it is not the security boundary.
  isSuperAdmin: boolean
  isSessionLoading: boolean
}

export function AdminDashboard({ isSuperAdmin, isSessionLoading }: AdminDashboardProps) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('health')
  const [days, setDays] = useState<WindowDays>(7)

  const health = useAdminHealth(days, isSuperAdmin && tab === 'health')
  const money = useAdminMoney(days, isSuperAdmin && tab === 'money')
  const users = useAdminUsers(days, isSuperAdmin && tab === 'users')
  const active = tab === 'health' ? health : tab === 'money' ? money : users

  if (isSessionLoading) return <Skeleton className="h-64 w-full" />

  // The 403 state, reached by typing the URL. Deliberately not a redirect: a
  // silent bounce leaves an operator who mistyped an account unsure whether the
  // page exists at all.
  if (!isSuperAdmin) {
    return (
      <ErrorState message={t('analytics.forbiddenBody')} />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">{t('analytics.title')}</h1>
          <p className="text-sm text-mist-dim">{t('analytics.subtitle')}</p>
        </div>
        <PillGroup
          label={t('analytics.windowLabel')}
          value={days}
          onChange={setDays}
          options={WINDOW_OPTIONS.map((d) => ({
            value: d,
            label: t('analytics.window', { count: d }),
          }))}
        />
      </header>

      <PillGroup
        label={t('analytics.sectionLabel')}
        value={tab}
        onChange={setTab}
        options={TABS.map((id) => ({ value: id, label: t(`analytics.tab.${id}`) }))}
      />

      {active.isPending ? <Skeleton className="h-96 w-full" /> : null}

      {active.error ? (
        <ErrorState
          message={
            active.error instanceof ApiClientError && active.error.code === 'forbidden'
              ? t('analytics.forbiddenBody')
              : t('analytics.errorBody')
          }
          onRetry={() => void active.refetch()}
        />
      ) : null}

      {tab === 'health' && health.data ? <HealthPanel data={health.data} /> : null}
      {tab === 'money' && money.data ? <MoneyPanel data={money.data} /> : null}
      {tab === 'users' && users.data ? <UsersPanel data={users.data} /> : null}
    </div>
  )
}
