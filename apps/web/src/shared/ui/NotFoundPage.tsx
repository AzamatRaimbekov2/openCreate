// apps/web/src/shared/ui/NotFoundPage.tsx
// Custom 404 (frontend-error-ux contract): calm standalone screen on paper with
// a way home. Wired as the root route's notFoundComponent in routes/__root.tsx.
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

export function NotFoundPage() {
  const { t } = useTranslation()
  return (
    // Editorial voice (brief: "serif headline, one line, one action"): a
    // vermillion micro-label stamp, an oversized Fraunces headline, one ink
    // pill home. The 404 numeral is decorative — the heading carries meaning.
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-cream px-6 text-center">
      <p
        aria-hidden="true"
        className="text-[11px] font-medium tracking-[0.3em] text-vermillion uppercase"
      >
        404
      </p>
      <h1 className="font-display text-5xl leading-[1.02] font-semibold tracking-tight text-ink md:text-6xl">
        {t('errors.notFound.title')}
      </h1>
      <p className="max-w-md text-ink-soft">{t('errors.notFound.description')}</p>
      {/* Link styled as the primary action — mirrors Button primary/md (ink
          pill, hover flips to vermillion) */}
      <Link
        to="/"
        className="mt-3 inline-flex min-h-10 items-center justify-center rounded-full bg-ink px-5 py-2 text-sm font-medium text-cream transition-colors duration-200 hover:bg-vermillion focus-visible:ring-2 focus-visible:ring-vermillion focus-visible:ring-offset-2 focus-visible:ring-offset-cream focus-visible:outline-none"
      >
        {t('common.goHome')}
      </Link>
    </main>
  )
}
