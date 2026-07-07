// apps/web/src/modules/Landing/components/LandingPage.tsx
// The whole standalone landing screen ('/'): slim top bar (wordmark, pricing
// link, EN/RU switch, session-aware action) + the four sections in reading
// order — Hero, PriceTable, HowItWorks, FaqClaims. Standalone on purpose:
// the marketing page owns its own top bar instead of the AppShell (design.md
// §9); the LangSwitch here is what the e2e "RU hero" scenario clicks.
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { LangSwitch } from 'shared/ui'
import { FaqClaims } from './FaqClaims'
import { Hero } from './Hero'
import { HowItWorks } from './HowItWorks'
import { PriceTable } from './PriceTable'

export type LandingPageProps = {
  // Where every CTA sends the visitor — /create when signed in, /login
  // otherwise. The ROUTE decides from the session; taking it as a prop keeps
  // Landing free of a modules/Auth import (cross-module imports are banned).
  ctaTo: '/create' | '/login'
}

export function LandingPage({ ctaTo }: LandingPageProps) {
  const { t } = useTranslation()

  return (
    <div className="min-h-screen bg-cream">
      <header className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-6 py-4">
        <Link
          to="/"
          className="rounded-xl text-lg font-semibold tracking-tight text-ink focus-visible:ring-2 focus-visible:ring-vermillion focus-visible:outline-none"
        >
          openCreate
        </Link>
        <div className="ml-auto flex items-center gap-3">
          <Link
            to="/pricing"
            className="inline-flex min-h-10 items-center rounded-xl px-3 text-sm font-medium text-ink-soft transition-opacity duration-150 hover:text-ink focus-visible:ring-2 focus-visible:ring-vermillion focus-visible:outline-none"
          >
            {t('nav.pricing')}
          </Link>
          <LangSwitch />
          {/* Session-aware top-bar action mirrors the hero CTA destination */}
          <Link
            to={ctaTo}
            className="inline-flex min-h-10 items-center justify-center rounded-xl px-4 py-2 text-sm font-medium text-ink transition-opacity duration-150 hover:bg-sand focus-visible:ring-2 focus-visible:ring-vermillion focus-visible:outline-none"
          >
            {ctaTo === '/login' ? t('nav.signIn') : t('nav.create')}
          </Link>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-6 pb-24">
        <Hero ctaTo={ctaTo} />
        <PriceTable />
        <HowItWorks />
        <FaqClaims />
      </main>
    </div>
  )
}
