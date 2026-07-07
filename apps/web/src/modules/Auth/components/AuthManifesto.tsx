// apps/web/src/modules/Auth/components/AuthManifesto.tsx
// The login screen's left panel (v3 terminal split, design.md §11): a mono
// weight-400 brand quote on the abyss surface step, the wordmark as the way
// back home, and the three approved claims as white/10 hairline ledger rows.
// Pure presentation — all copy is i18n'd and the claims REUSE the landing's
// keys so the approved wording has exactly one source of truth.
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
    // bg-abyss: the sunken surface step — the panel reads as a recessed plate
    // beside the void-borne form (elevation by color, design.md v3 §2)
    <aside className="flex flex-col gap-12 bg-abyss px-6 py-10 md:px-10 lg:min-h-screen lg:justify-between lg:px-14 lg:py-12">
      {/* Mono wordmark = the escape hatch back to the landing. The portal-blue
          middle dot is decorative — the accessible name stays "openCreate". */}
      <Link
        to="/"
        className="self-start rounded-lg text-xl font-medium text-white focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
      >
        openCreate
        <span aria-hidden="true" className="text-portal">
          ·
        </span>
      </Link>

      <div className="flex max-w-md flex-col gap-5">
        {/* Quiet mono kicker (v3: lowercase, same voice as the hero) */}
        <p className="text-xs text-mist-dim">{t('landing.kicker')}</p>
        {/* The manifesto line — mono weight-400 30px (the heading law), the
            panel's reason to exist; whisper-weight IS the brand gesture */}
        <p className="text-3xl leading-[1.2] font-normal text-white">{t('auth.manifesto.quote')}</p>
        <p className="text-xs text-mist-dim">{t('auth.manifesto.caption')}</p>
      </div>

      {/* The approved claims as quiet ledger rows — white/10 hairlines */}
      <ul className="flex max-w-md flex-col border-t border-white/10">
        {claims.map((claim) => (
          <li key={claim.key} className="border-b border-white/10 py-3 text-sm text-mist-dim">
            {claim.text}
          </li>
        ))}
      </ul>
    </aside>
  )
}
