// apps/web/src/routes/_shell.pricing.tsx
// Pricing page ('/pricing', inside the AppShell layout) — public, NOT
// auth-guarded: comparing prices is exactly what signed-out visitors do.
// Composition only: the verified PriceTable (modules/Landing), the live
// per-model credit table fed by the Generator's catalog query (same
// ['catalog'] cache entry as the create page), and the 200-free-credits
// signup CTA for visitors.
import { Link, createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useAuthSession } from 'modules/Auth'
import { useCatalog } from 'modules/Generator'
import { ModelCreditTable, PriceTable } from 'modules/Landing'
import { EmptyState, ErrorState, Skeleton } from 'shared/ui'

export const Route = createFileRoute('/_shell/pricing')({
  component: PricingPage,
})

// Static keys for the fixed skeleton rows — index keys are banned even here
const SKELETON_KEYS = ['s1', 's2', 's3', 's4', 's5', 's6']

// NOT exported: route files may only export Route, or the router plugin
// cannot code-split the screen
function PricingPage() {
  const { t } = useTranslation()
  const session = useAuthSession()
  const catalog = useCatalog()

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('pricing.title')}</h1>
        <p className="text-ink-soft">{t('pricing.subtitle')}</p>
      </header>

      {/* The same verified comparison card the landing shows — one source of truth */}
      <PriceTable />

      <section className="flex flex-col gap-6">
        <h2 className="text-xl font-semibold text-ink">{t('pricing.models.title')}</h2>
        {catalog.isPending ? (
          // Loading: table-silhouette rows, no layout shift when data lands
          <div className="flex flex-col gap-2 rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
            {SKELETON_KEYS.map((key) => (
              <Skeleton
                key={key}
                className="h-10 w-full rounded-xl"
              />
            ))}
          </div>
        ) : catalog.isError ? (
          <ErrorState
            message={t('errors.loadFailed')}
            onRetry={() => void catalog.refetch()}
          />
        ) : catalog.data.models.length === 0 ? (
          // Defensive: the API always ships a curated catalog, but an empty
          // screen is never allowed (4-states rule)
          <EmptyState
            title={t('generator.unavailable.title')}
            description={t('generator.unavailable.description')}
          />
        ) : (
          <ModelCreditTable models={catalog.data.models} />
        )}
      </section>

      {/* Signup CTA only makes sense for visitors — signed-in users already
          claimed their 200 credits */}
      {session.data ? null : (
        <section className="flex flex-col items-center gap-3 rounded-2xl border border-ink/10 bg-white p-8 text-center shadow-sm">
          <h2 className="text-xl font-semibold text-ink">{t('pricing.cta.title')}</h2>
          <p className="max-w-md text-sm text-ink-soft">{t('pricing.cta.description')}</p>
          {/* Link styled as the primary lg action — mirrors Button primary/lg classes */}
          <Link
            to="/login"
            className="mt-1 inline-flex min-h-12 items-center justify-center rounded-xl bg-accent px-6 py-3 text-base font-medium text-white transition-opacity duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            {t('pricing.cta.button')}
          </Link>
        </section>
      )}
    </main>
  )
}
