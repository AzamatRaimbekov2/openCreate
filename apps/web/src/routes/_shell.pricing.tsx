// apps/web/src/routes/_shell.pricing.tsx
// Pricing page ('/pricing', inside the AppShell layout) — public, NOT
// auth-guarded: comparing prices is exactly what signed-out visitors do.
// Composition only, in the v3 terminal "index" treatment: quiet mono kicker +
// mono weight-400 title with the "200 free credits" chip, the verified
// PriceTable (modules/Landing), the live per-model credit table fed by the
// Generator's catalog query (same ['catalog'] cache entry as the create page),
// and the signup CTA for visitors as a steel surface card.
import { Link, createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useAuthSession } from 'modules/Auth'
import { useCatalog } from 'modules/Generator'
import { ModelCreditTable, PriceTable, SectionHeading } from 'modules/Landing'
import { Badge, EmptyState, ErrorState, Skeleton } from 'shared/ui'

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
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-6 py-12 md:gap-24 md:py-16">
      {/* Terminal page opener: quiet mono kicker, mono weight-400 30px title
          (the heading law) with the brief-mandated "200 free credits" chip */}
      <header className="flex flex-col gap-3">
        <span className="text-xs text-mist-dim">{t('pricing.kicker')}</span>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="text-3xl font-normal text-white">{t('pricing.title')}</h1>
          {/* The chip is a fact about signup, shown to everyone — the signup
              CTA below stays visitor-only */}
          <Badge variant="accent">{t('pricing.stamp')}</Badge>
        </div>
        <p className="text-base text-mist-dim">{t('pricing.subtitle')}</p>
      </header>

      {/* The same verified comparison the landing shows — one source of truth,
          here as the page's opening 01 index section */}
      <PriceTable />

      <section className="flex flex-col gap-8">
        <SectionHeading ordinal="02" title={t('pricing.models.title')} />
        {catalog.isPending ? (
          // Loading: table-silhouette rows inside the index's hairline frame,
          // no layout shift when data lands
          <div className="flex flex-col gap-3 border-b border-white/10 pb-4">
            {SKELETON_KEYS.map((key) => (
              <Skeleton key={key} className="h-10 w-full" />
            ))}
          </div>
        ) : catalog.isError ? (
          <ErrorState message={t('errors.loadFailed')} onRetry={() => void catalog.refetch()} />
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
          claimed their 200 credits. Steel surface card (design.md v3 §2:
          app-screen cards live on #1d293d, 8px radius, no shadow) */}
      {session.data ? null : (
        <section className="flex flex-col items-start gap-3 rounded-lg bg-steel p-8 md:p-12">
          <h2 className="text-2xl font-normal text-white">{t('pricing.cta.title')}</h2>
          <p className="max-w-md text-sm text-mist-dim">{t('pricing.cta.description')}</p>
          {/* Link styled as the primary lg action — mirrors Button primary/lg
              classes (GREEN specimen pill: sign-up is a create action) */}
          <Link
            to="/login"
            className="mt-2 inline-flex min-h-12 items-center justify-center rounded-full border border-white/10 bg-specimen-green/20 px-7 py-3 text-base font-medium text-glow-green shadow-pill transition-colors duration-200 hover:bg-specimen-green/35 focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
          >
            {t('pricing.cta.button')}
          </Link>
        </section>
      )}
    </main>
  )
}
