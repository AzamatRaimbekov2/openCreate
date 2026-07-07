// apps/web/src/shared/ui/NotFoundPage.tsx
// Custom 404 (frontend-error-ux contract): calm standalone screen on the void
// with a way home. Wired as the root route's notFoundComponent in routes/__root.tsx.
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

export function NotFoundPage() {
  const { t } = useTranslation()
  return (
    // Terminal voice: a portal-blue mono "404" status line, a whisper-weight
    // mono headline (30px, weight 400 — headings never bold), one green
    // specimen pill home. The 404 numeral is decorative — the heading carries
    // the meaning for screen readers.
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-void px-6 text-center">
      <p aria-hidden="true" className="text-sm text-portal">
        404
      </p>
      <h1 className="max-w-xl text-3xl font-normal text-white">{t('errors.notFound.title')}</h1>
      <p className="max-w-md text-mist-dim">{t('errors.notFound.description')}</p>
      {/* Link styled as the primary action — mirrors Button primary/md (green
          specimen pill: going home is the constructive next step) */}
      <Link
        to="/"
        className="mt-3 inline-flex min-h-10 items-center justify-center rounded-full border border-white/10 bg-specimen-green/20 px-5 py-2 text-sm font-medium text-glow-green shadow-pill transition-colors duration-200 hover:bg-specimen-green/35 focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
      >
        {t('common.goHome')}
      </Link>
    </main>
  )
}
