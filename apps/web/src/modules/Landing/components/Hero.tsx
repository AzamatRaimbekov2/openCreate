// apps/web/src/modules/Landing/components/Hero.tsx
// Landing hero (v3 Stage 2 "Bioluminescent Terminal"): a FULL-VIEWPORT stage
// with the animated ASCII ellipsoid behind centered content — the MASCOT figure
// (the brand's face, owner brief 2026-07-24: media-first), the big mono
// wordmark, the quiet kicker, the whisper-weight mono display headline (weight
// 400 with exactly ONE portal-blue accent word), the approved claims line in
// mist, and the two specimen-pill CTAs: GREEN "start creating" (THE create
// action) + AMBER "see pricing" (explore tint). The mascot leads now — the
// sphere dimmed to faint atmosphere behind it. Copy rules: ONLY the verified
// claims, never a blanket "cheaper than everything" line.
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { AsciiSphere } from 'shared/ui'

export type HeroProps = {
  // Where the CTA sends the visitor — /create when signed in, /login otherwise
  // (decided by the route; the module never reads the session itself)
  ctaTo: '/create' | '/login'
}

// Shared pill silhouette for the two hero CTA links — mirrors Button lg
// anatomy (rounded-full + white/10 border + shadow-pill, the ONE allowed shadow)
const pillBaseClass =
  'inline-flex min-h-12 items-center justify-center rounded-full border border-white/10 px-7 py-3 text-base font-medium shadow-pill transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none'

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
    // Full-viewport stage (min-h-svh: small-viewport unit so mobile URL bars
    // never cut the CTAs off); everything centers over the sphere
    <section className="relative flex min-h-svh flex-col items-center justify-center px-6 py-24">
      {/* The generative visual: fills the whole stage behind the copy.
          pointer-events-none keeps text selection and CTA clicks unobstructed.
          Dimmed to 60% now that the mascot is the focal figure — the sphere
          stays as faint atmosphere behind it, not a competing subject. */}
      <AsciiSphere className="pointer-events-none absolute inset-0 h-full w-full opacity-60" />
      <div className="relative flex max-w-3xl flex-col items-center gap-6 text-center">
        {/* The mascot IS the hero now (owner brief, 2026-07-24: media-first).
            A recessed abyss media well + hairline — the design system's plate
            treatment for artwork — sized responsively so the CTAs stay near the
            fold. The dark nebula key art bleeds into the void by design. */}
        <figure className="w-[clamp(11rem,26vw,18rem)] overflow-hidden rounded-2xl border border-white/10 bg-abyss">
          <img
            src="/hero-mascot.jpg"
            alt={t('landing.heroMascotAlt')}
            width={900}
            height={900}
            fetchPriority="high"
            className="aspect-square h-full w-full object-cover"
          />
        </figure>
        {/* The centered mono wordmark — the brand plate of the hero (the
            masthead carries no wordmark on the landing; this IS it). The
            portal middle dot is the brand cursor, decorative as everywhere. */}
        <p className="text-2xl font-medium text-white md:text-3xl">
          openCreate
          <span aria-hidden="true" className="text-portal">
            ·
          </span>
        </p>
        {/* Quiet mono kicker — the honest one-line product descriptor */}
        <p className="text-xs text-mist-dim">{t('landing.kicker')}</p>
        {/* Whisper-weight mono display: large size at weight 400 IS the v3
            signature — bolding it would break the law's weight ceiling. The
            clamp tops out lower than a serif would because mono runs wide. */}
        <h1 className="max-w-[24ch] text-[clamp(1.875rem,5vw,3.75rem)] leading-[1.1] font-normal text-white">
          {accentIndex === -1 ? (
            // Defensive: if a locale ships without a matching accent word the
            // headline still renders whole instead of losing text
            headline
          ) : (
            <>
              {headline.slice(0, accentIndex)}
              {/* THE one accent word: portal blue — the only chromatic accent
                  in prose (§2). not-italic: only upright mono faces ship. */}
              <em className="text-portal not-italic">{accent}</em>
              {headline.slice(accentIndex + accent.length)}
            </>
          )}
        </h1>
        {/* Claims line in MIST (body voice — these are the product's facts,
            not secondary chrome) */}
        <p className="max-w-2xl text-base text-mist md:text-lg">{claims}</p>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-4">
          {/* GREEN specimen pill: "start creating" is THE create action */}
          <Link
            to={ctaTo}
            className={`${pillBaseClass} bg-specimen-green/20 text-glow-green hover:bg-specimen-green/35`}
          >
            {t('landing.cta')}
          </Link>
          {/* AMBER specimen pill: pricing is explore/browse in the triad
              taxonomy (Stage 2 promoted this from a text link to a pill —
              the reference hero pairs two pills) */}
          <Link
            to="/pricing"
            className={`${pillBaseClass} bg-specimen-amber/20 text-lumen-amber hover:bg-specimen-amber/35`}
          >
            {t('landing.secondaryCta')}
          </Link>
        </div>
      </div>
    </section>
  )
}
