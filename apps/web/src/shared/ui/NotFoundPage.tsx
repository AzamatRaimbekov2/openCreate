// apps/web/src/shared/ui/NotFoundPage.tsx
// Custom 404 (frontend-error-ux contract): calm standalone screen on paper with
// a way home. Wired as the root route's notFoundComponent in routes/__root.tsx.
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

export function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-paper px-6 text-center">
      <p aria-hidden="true" className="text-sm font-medium text-ink-soft">
        404
      </p>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">
        {t('errors.notFound.title')}
      </h1>
      <p className="max-w-md text-ink-soft">{t('errors.notFound.description')}</p>
      {/* Link styled as the primary action — mirrors Button primary/md classes */}
      <Link
        to="/"
        className="mt-2 inline-flex min-h-10 items-center justify-center rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity duration-150 hover:bg-accent/90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
      >
        {t('common.goHome')}
      </Link>
    </main>
  )
}
