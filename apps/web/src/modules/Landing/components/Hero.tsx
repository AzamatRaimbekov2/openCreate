// apps/web/src/modules/Landing/components/Hero.tsx
// Landing hero (v3 "Bioluminescent Terminal"): quiet mono kicker, whisper-weight
// mono display headline (weight 400 — the reference signature) with exactly ONE
// portal-blue accent word, the approved claims line, and a GREEN specimen-pill
// CTA beside a portal text link to the price index. Copy rules (plan Task 19):
// ONLY the verified claims — never a blanket "cheaper than everything" line.
// (Stage 2 will add the ASCII-sphere hero visual; the type system lands now.)
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

export type HeroProps = {
  // Where the CTA sends the visitor — /create when signed in, /login otherwise
  // (decided by the route; the module never reads the session itself)
  ctaTo: '/create' | '/login'
}

export function Hero({ ctaTo }: HeroProps) {
  const { t } = useTranslation()

  // The three approved claims, mid-dot separated in one readable line
  const claims = [
    t('landing.claims.images'),
    t('landing.claims.videos'),
    t('landing.claims.expire'),
  ].join(' · ')

  // The accent word is locale-driven (EN "video", RU «копейки») and rendered
  // as an inline <em> INSIDE the headline text, so the h1's accessible name
  // stays the exact i18n headline (e2e asserts it verbatim) and the prerender
  // grep for the contiguous "Pay pennies, not plans." keeps passing — which is
  // also why the EN accent must live in the FIRST sentence.
  const headline = t('landing.headline')
  const accent = t('landing.headlineAccent')
  const accentIndex = headline.indexOf(accent)

  return (
    <section className="flex flex-col items-start gap-8 pt-14 md:pt-24">
      {/* Quiet mono kicker — v3 dropped the uppercase tracking (the terminal
          voice never shouts), so DOM text and rendering now match 1:1 */}
      <p className="text-xs text-mist-dim">{t('landing.kicker')}</p>
      {/* Whisper-weight mono display: large size at weight 400 IS the v3
          signature — bolding it would break the law's weight ceiling. The
          clamp tops out lower than v2's serif because mono glyphs run wide. */}
      <h1 className="max-w-[20ch] text-[clamp(1.875rem,5vw,3.75rem)] leading-[1.1] font-normal text-white">
        {accentIndex === -1 ? (
          // Defensive: if a locale ships without a matching accent word the
          // headline still renders whole instead of losing text
          headline
        ) : (
          <>
            {headline.slice(0, accentIndex)}
            {/* THE one accent word: portal blue — the only chromatic accent in
                prose (§2). not-italic: only the upright mono faces ship, and a
                synthesized oblique would fake a face the system doesn't have. */}
            <em className="text-portal not-italic">{accent}</em>
            {headline.slice(accentIndex + accent.length)}
          </>
        )}
      </h1>
      <p className="max-w-2xl text-lg text-mist-dim">{claims}</p>
      <div className="flex flex-wrap items-center gap-x-7 gap-y-4">
        {/* Link styled as the primary lg action — mirrors Button primary/lg
            classes (GREEN specimen pill: "start creating" is THE create action) */}
        <Link
          to={ctaTo}
          className="inline-flex min-h-12 items-center justify-center rounded-full border border-white/10 bg-specimen-green/20 px-7 py-3 text-base font-medium text-glow-green shadow-pill transition-colors duration-200 hover:bg-specimen-green/35 focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
        >
          {t('landing.cta')}
        </Link>
        {/* Secondary text link: portal blue — the sanctioned prose link color */}
        <Link
          to="/pricing"
          className="inline-flex min-h-12 items-center text-sm font-medium text-portal underline decoration-portal/40 underline-offset-4 transition-colors duration-200 hover:decoration-portal focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
        >
          {t('landing.secondaryCta')}
        </Link>
      </div>
    </section>
  )
}
