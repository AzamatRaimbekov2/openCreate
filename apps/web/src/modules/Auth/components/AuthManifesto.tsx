// apps/web/src/modules/Auth/components/AuthManifesto.tsx
// The login screen's left panel (editorial split, design.md §11): a serif
// brand quote on the tinted sand surface, the wordmark as the way back home,
// and the three approved claims as hairline ledger rows. Pure presentation —
// all copy is i18n'd and the claims REUSE the landing's keys so the approved
// wording has exactly one source of truth.
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

export function AuthManifesto() {
  const { t } = useTranslation()

  // The approved claims — stable keys, never invented copy (spec copy rule)
  const claims = [
    { key: 'images', text: t('landing.claims.images') },
    { key: 'videos', text: t('landing.claims.videos') },
    { key: 'expire', text: t('landing.claims.expire') },
  ]

  return (
    <aside className="flex flex-col gap-12 bg-sand px-6 py-10 md:px-10 lg:min-h-screen lg:justify-between lg:px-14 lg:py-12">
      {/* Serif wordmark = the escape hatch back to the landing. The vermillion
          middle dot is decorative — the accessible name stays "openCreate". */}
      <Link
        to="/"
        className="self-start rounded-sm font-display text-xl font-semibold tracking-tight text-ink focus-visible:ring-2 focus-visible:ring-vermillion focus-visible:outline-none"
      >
        openCreate
        <span aria-hidden="true" className="text-vermillion">
          ·
        </span>
      </Link>

      <div className="flex max-w-md flex-col gap-5">
        {/* Uppercase micro-label kicker (CSS-only uppercase, same as the hero) */}
        <p className="text-[11px] font-medium tracking-[0.2em] text-ink-soft uppercase">
          {t('landing.kicker')}
        </p>
        {/* The manifesto line — display serif, the panel's reason to exist */}
        <p className="font-display text-3xl leading-[1.05] font-semibold tracking-tight text-ink md:text-4xl">
          {t('auth.manifesto.quote')}
        </p>
        <p className="text-[11px] font-medium tracking-[0.18em] text-ink-soft uppercase">
          {t('auth.manifesto.caption')}
        </p>
      </div>

      {/* The approved claims as quiet ledger rows — hairlines on sand */}
      <ul className="flex max-w-md flex-col border-t border-ink/10">
        {claims.map((claim) => (
          <li
            key={claim.key}
            className="border-b border-ink/10 py-3 text-sm text-ink-soft"
          >
            {claim.text}
          </li>
        ))}
      </ul>
    </aside>
  )
}
