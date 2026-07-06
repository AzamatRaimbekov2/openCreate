// apps/web/src/routes/index.tsx
// Landing route ('/') — placeholder headline until modules/Landing ships (Task 19).
// Routes stay composition-only: no business logic lives here.
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

export const Route = createFileRoute('/')({
  component: LandingPlaceholder,
})

function LandingPlaceholder() {
  const { t } = useTranslation()
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-paper px-6 text-center">
      <h1 className="text-4xl font-semibold tracking-tight text-ink">{t('landing.headline')}</h1>
      <p className="max-w-xl text-lg text-ink-soft">{t('landing.subtitle')}</p>
    </main>
  )
}
