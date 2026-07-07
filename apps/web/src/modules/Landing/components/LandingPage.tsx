// apps/web/src/modules/Landing/components/LandingPage.tsx
// The whole standalone landing screen ('/'), v3 Stage 2 terminal: a FLOATING
// transparent masthead (nav only — the wordmark lives centered in the hero)
// over the full-viewport ascii-sphere Hero, then the narrow ~800px RESEARCH
// COLUMN — specimen showcase grid, the mono terminal price index, plain
// how-it-works prose rows, FAQ prose — closed by a minimal footer.
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

// Masthead nav links share the AppShell's quiet lowercase mono voice so the
// marketing page and the app read as one terminal (the terminal never shouts)
const mastheadLinkClass =
  'inline-flex min-h-10 items-center rounded-full px-3 text-sm text-mist-dim transition-colors duration-200 hover:text-white focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none'

export function LandingPage({ ctaTo }: LandingPageProps) {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-screen flex-col bg-void">
      {/* Floating transparent masthead: Stage 2 moved the wordmark into the
          hero center (the reference's minimal chrome), so the bar carries only
          the quiet nav — absolute, not sticky: once the reader scrolls into
          the research column, the document speaks for itself */}
      <header className="absolute inset-x-0 top-0 z-40">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-end gap-2 px-6 py-4">
          <Link to="/pricing" className={mastheadLinkClass}>
            {t('nav.pricing')}
          </Link>
          <LangSwitch />
          {/* Session-aware top-bar action mirrors the hero CTA destination;
              stays a quiet link (the hero pills below are the real CTAs) */}
          <Link to={ctaTo} className={`${mastheadLinkClass} hover:bg-ridge`}>
            {ctaTo === '/login' ? t('nav.signIn') : t('nav.create')}
          </Link>
        </div>
      </header>
      <main className="flex w-full flex-col">
        {/* Full-bleed, full-viewport hero — the only section outside the
            research column */}
        <Hero ctaTo={ctaTo} />
        {/* The research column: ~800px (max-w-[50rem]), ≥96px between
            sections on desktop (gap-28 = 112px) — the document part of the
            reference's landing */}
        <div className="mx-auto flex w-full max-w-[50rem] flex-col gap-16 px-6 pt-4 pb-24 md:gap-28 md:pb-32">
          <ShowcaseSpread />
          <PriceTable />
          <HowItWorks />
          <FaqClaims />
        </div>
      </main>
      {/* Minimal footer: one hairline, one quiet mono line — tagline + rights
          (the hero already carries the big wordmark; repeating it here would
          be chrome the reference does without) */}
      <footer className="border-t border-white/10">
        <div className="mx-auto flex w-full max-w-[50rem] flex-col gap-2 px-6 py-10 text-xs text-mist-dim md:flex-row md:items-baseline md:justify-between md:gap-6">
          <p>{t('landing.footer.tagline')}</p>
          <p className="shrink-0">{t('landing.footer.rights')}</p>
        </div>
      </footer>
    </div>
  )
}
