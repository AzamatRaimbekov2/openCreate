// apps/web/src/routes/create.tsx
// Create screen ('/create') — auth-guarded (beforeLoad bounces signed-out
// visitors to /login before anything mounts). Composition only: the Generator
// module owns all form logic; Task 17 adds the live Gallery column beside it.
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { requireSession } from 'modules/Auth'
import { GeneratorPanel } from 'modules/Generator'

export const Route = createFileRoute('/create')({
  beforeLoad: () => requireSession(),
  component: CreatePage,
})

function CreatePage() {
  const { t } = useTranslation()
  return (
    <main className="min-h-screen bg-paper">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('generator.title')}</h1>
        {/* Two-column on desktop from Task 17 (panel left, live gallery right);
            constrained single column keeps the form readable meanwhile */}
        <div className="w-full max-w-xl">
          <GeneratorPanel />
        </div>
      </div>
    </main>
  )
}
