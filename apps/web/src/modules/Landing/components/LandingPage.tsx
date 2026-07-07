// apps/web/src/modules/Landing/components/LandingPage.tsx
// The whole standalone landing screen ('/'): hairline masthead (serif
// wordmark, uppercase nav micro-labels, EN/RU switch, session-aware action)
// + the editorial reading order — Hero, Selected works spread, The index,
// numbered How-it-works rows, FAQ rows — closed by a colophon footer.
// Standalone on purpose: the marketing page owns its own top bar instead of
// the AppShell (design.md §10); the LangSwitch here is what the e2e "RU hero"
// scenario clicks.
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { LangSwitch } from 'shared/ui'
import { FaqClaims } from './FaqClaims'
import { Hero } from './Hero'
import { HowItWorks } from './HowItWorks'
import { PriceTable } from './PriceTable'
import { ShowcaseSpread } from './ShowcaseSpread'

export type LandingPageProps = {
  // Where every CTA sends the visitor — /create when signed in, /login
  // otherwise. The ROUTE decides from the session; taking it as a prop keeps
  // Landing free of a modules/Auth import (cross-module imports are banned).
  ctaTo: '/create' | '/login'
}

// Masthead nav links share the AppShell's uppercase micro-label voice so the
// marketing page and the app read as one magazine
const mastheadLinkClass =
  'inline-flex min-h-10 items-center rounded-full px-3 text-xs font-medium tracking-[0.18em] uppercase text-ink-soft transition-colors duration-200 hover:text-ink focus-visible:ring-2 focus-visible:ring-vermillion focus-visible:outline-none'

export function LandingPage({ ctaTo }: LandingPageProps) {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-screen flex-col bg-cream">
      {/* Hairline masthead — mirrors the AppShell top bar (same wordmark,
          same nav voice) so '/' and the app are visibly one brand */}
      <header className="border-b border-ink/15">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3">
          {/* Serif wordmark "openCreate·": the vermillion middle dot is the
              brand's typographic period — decorative, so the accessible name
              stays "openCreate" */}
          <Link
            to="/"
            className="rounded-sm font-display text-xl font-semibold tracking-tight text-ink focus-visible:ring-2 focus-visible:ring-vermillion focus-visible:outline-none"
          >
            openCreate
            <span aria-hidden="true" className="text-vermillion">
              ·
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <Link to="/pricing" className={mastheadLinkClass}>
              {t('nav.pricing')}
            </Link>
            <LangSwitch />
            {/* Session-aware top-bar action mirrors the hero CTA destination */}
            <Link to={ctaTo} className={`${mastheadLinkClass} hover:bg-sand`}>
              {ctaTo === '/login' ? t('nav.signIn') : t('nav.create')}
            </Link>
          </div>
        </div>
      </header>
      {/* ≥96px between sections on desktop (brief QA #3): gap-28 = 112px */}
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-6 pb-24 md:gap-28 md:pb-32">
        <Hero ctaTo={ctaTo} />
        <ShowcaseSpread />
        <PriceTable ordinal="02" />
        <HowItWorks />
        <FaqClaims />
      </main>
      {/* Colophon footer — the magazine's closing plate: wordmark, the
          typographic colophon line, and the rights micro-label */}
      <footer className="border-t border-ink/15">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-12 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-2">
            <span className="font-display text-2xl font-semibold tracking-tight text-ink">
              openCreate
              <span aria-hidden="true" className="text-vermillion">
                ·
              </span>
            </span>
            <p className="max-w-md text-sm text-ink-soft">{t('landing.footer.tagline')}</p>
          </div>
          <p className="text-[11px] font-medium tracking-[0.18em] text-ink-soft uppercase">
            {t('landing.footer.rights')}
          </p>
        </div>
      </footer>
    </div>
  )
}
