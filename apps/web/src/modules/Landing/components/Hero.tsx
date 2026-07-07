// apps/web/src/modules/Landing/components/Hero.tsx
// Editorial landing hero ("Light Editorial" v2): uppercase micro-label kicker,
// giant left-aligned Fraunces headline with exactly ONE vermillion italic
// word, the approved claims line, and a solid-ink CTA pill (hover →
// vermillion) beside a quiet text link to the price index. Copy rules (plan
// Task 19): ONLY the verified claims — never a blanket "cheaper than
// everything" line.
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
      {/* Uppercase micro-label kicker — CSS-only uppercase keeps the DOM text
          (and the i18n string tests query) in sentence case */}
      <p className="text-[11px] font-medium tracking-[0.2em] text-ink-soft uppercase">
        {t('landing.kicker')}
      </p>
      <h1 className="max-w-[17ch] font-display text-[clamp(3.5rem,8vw,7rem)] leading-[0.98] font-semibold tracking-tight text-ink">
        {accentIndex === -1 ? (
          // Defensive: if a locale ships without a matching accent word the
          // headline still renders whole instead of losing text
          headline
        ) : (
          <>
            {headline.slice(0, accentIndex)}
            {/* THE one editorial accent: Fraunces italic in vermillion — large
                display text, the sanctioned vermillion-on-cream use (§2) */}
            <em className="text-vermillion italic">{accent}</em>
            {headline.slice(accentIndex + accent.length)}
          </>
        )}
      </h1>
      <p className="max-w-2xl text-lg text-ink-soft">{claims}</p>
      <div className="flex flex-wrap items-center gap-x-7 gap-y-4">
        {/* Link styled as the primary lg action — mirrors Button primary/lg classes */}
        <Link
          to={ctaTo}
          className="inline-flex min-h-12 items-center justify-center rounded-full bg-ink px-7 py-3 text-base font-medium text-cream transition-colors duration-200 hover:bg-vermillion focus-visible:ring-2 focus-visible:ring-vermillion focus-visible:outline-none"
        >
          {t('landing.cta')}
        </Link>
        {/* Secondary text link: hairline underline that solidifies to
            vermillion on hover — the text itself stays ink (contrast §2) */}
        <Link
          to="/pricing"
          className="inline-flex min-h-12 items-center text-sm font-medium text-ink underline decoration-ink/30 underline-offset-4 transition-colors duration-200 hover:decoration-vermillion focus-visible:ring-2 focus-visible:ring-vermillion focus-visible:outline-none"
        >
          {t('landing.secondaryCta')}
        </Link>
      </div>
    </section>
  )
}
