// apps/web/src/modules/Landing/components/Hero.tsx
// Landing hero: display headline, the three approved claims, primary CTA and
// a decorative showcase strip. Copy rules (plan Task 19): ONLY the verified
// claims — never a blanket "cheaper than everything" line.
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

export type HeroProps = {
  // Where the CTA sends the visitor — /create when signed in, /login otherwise
  // (decided by the route; the module never reads the session itself)
  ctaTo: '/create' | '/login'
}

// Static curated thumbnails (committed gradient placeholders — replace with
// real product output later). Mixed aspects give the strip a live gallery feel.
const SHOWCASE = [
  { id: 'wide-dawn', src: '/showcase/wide-dawn.webp', aspect: 'aspect-video' },
  { id: 'tall-city', src: '/showcase/tall-city.webp', aspect: 'aspect-[9/16]' },
  { id: 'square-bloom', src: '/showcase/square-bloom.webp', aspect: 'aspect-square' },
  { id: 'wide-sea', src: '/showcase/wide-sea.webp', aspect: 'aspect-video' },
] as const

export function Hero({ ctaTo }: HeroProps) {
  const { t } = useTranslation()

  // The three approved claims, mid-dot separated in one readable line
  const claims = [
    t('landing.claims.images'),
    t('landing.claims.videos'),
    t('landing.claims.expire'),
  ].join(' · ')

  return (
    <section className="flex flex-col items-center gap-6 pt-16 text-center">
      <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-ink md:text-5xl">
        {t('landing.headline')}
      </h1>
      <p className="max-w-xl text-lg text-ink-soft">{claims}</p>
      {/* Link styled as the primary lg action — mirrors Button primary/lg classes */}
      <Link
        to={ctaTo}
        className="inline-flex min-h-12 items-center justify-center rounded-xl bg-accent px-6 py-3 text-base font-medium text-white transition-opacity duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
      >
        {t('landing.cta')}
      </Link>
      {/* Purely decorative: hidden from the a11y tree so screen readers go
          straight from the CTA to the price comparison */}
      <div aria-hidden="true" className="mt-6 flex w-full items-stretch justify-center gap-3">
        {SHOWCASE.map((item) => (
          <div
            key={item.id}
            className={`h-40 shrink-0 overflow-hidden rounded-2xl bg-media ${item.aspect}`}
          >
            <img src={item.src} alt="" loading="lazy" className="h-full w-full object-cover" />
          </div>
        ))}
      </div>
    </section>
  )
}
