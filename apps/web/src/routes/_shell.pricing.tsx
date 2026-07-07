// apps/web/src/routes/_shell.pricing.tsx
// Pricing page ('/pricing', inside the AppShell layout) — public, NOT
// auth-guarded: comparing prices is exactly what signed-out visitors do.
// Composition only, in the editorial "index" treatment: kicker + serif title
// with the "200 free credits" stamp, the verified PriceTable (modules/Landing),
// the live per-model credit table fed by the Generator's catalog query (same
// ['catalog'] cache entry as the create page), and the signup CTA for
// visitors as a tinted sand block.
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
      {/* Editorial page opener: uppercase kicker, display serif title with the
          brief-mandated "200 free credits" stamp beside it */}
      <header className="flex flex-col gap-3">
        <span className="text-[11px] font-medium tracking-[0.2em] text-ink-soft uppercase">
          {t('pricing.kicker')}
        </span>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-ink md:text-6xl">
            {t('pricing.title')}
          </h1>
          {/* The stamp is a fact about signup, shown to everyone — the signup
              CTA below stays visitor-only */}
          <Badge variant="accent">{t('pricing.stamp')}</Badge>
        </div>
        <p className="text-base text-ink-soft">{t('pricing.subtitle')}</p>
      </header>

      {/* The same verified comparison the landing shows — one source of truth,
          here as the page's opening 01 index section */}
      <PriceTable />

      <section className="flex flex-col gap-8">
        <SectionHeading ordinal="02" title={t('pricing.models.title')} />
        {catalog.isPending ? (
          // Loading: table-silhouette rows inside the index's hairline frame,
          // no layout shift when data lands
          <div className="flex flex-col gap-3 border-b border-ink/15 pb-4">
            {SKELETON_KEYS.map((key) => (
              <Skeleton
                key={key}
                className="h-10 w-full"
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
          claimed their 200 credits. Tinted sand block (not a boxy white card):
          the editorial "manifesto" surface with ink text only (design.md §2) */}
      {session.data ? null : (
        <section className="flex flex-col items-start gap-3 rounded-sm bg-sand p-8 md:p-12">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-ink md:text-3xl">
            {t('pricing.cta.title')}
          </h2>
          <p className="max-w-md text-sm text-ink-soft">{t('pricing.cta.description')}</p>
          {/* Link styled as the primary lg action — mirrors Button primary/lg classes */}
          <Link
            to="/login"
            className="mt-2 inline-flex min-h-12 items-center justify-center rounded-full bg-ink px-7 py-3 text-base font-medium text-cream transition-colors duration-200 hover:bg-vermillion focus-visible:ring-2 focus-visible:ring-vermillion focus-visible:outline-none"
          >
            {t('pricing.cta.button')}
          </Link>
        </section>
      )}
    </main>
  )
}
