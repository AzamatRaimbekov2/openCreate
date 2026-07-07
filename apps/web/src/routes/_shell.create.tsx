// apps/web/src/routes/_shell.create.tsx
// Create screen ('/create', inside the AppShell layout since Task 18) —
// auth-guarded (beforeLoad bounces signed-out visitors to /login before
// anything mounts). Composition only: form left, live gallery right — a submit
// prepends its card next door instantly, which is the module pair's success
// feedback (no toast in the kit by design). The shell owns the page canvas
// (bg-cream + min-height), so the screen only lays out its own content.
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { requireSession } from 'modules/Auth'
import { GalleryGrid } from 'modules/Gallery'
import { GeneratorPanel } from 'modules/Generator'

export const Route = createFileRoute('/_shell/create')({
  beforeLoad: () => requireSession(),
  component: CreatePage,
})

function CreatePage() {
  const { t } = useTranslation()
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">{t('generator.title')}</h1>
      {/* Mobile stacks (form first); desktop pins the form to a readable
          26rem column and gives the gallery the rest */}
      <div className="grid gap-8 lg:grid-cols-[26rem_minmax(0,1fr)] lg:items-start">
        <GeneratorPanel />
        <section aria-label={t('gallery.title')} className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold text-ink">{t('gallery.title')}</h2>
          {/* No create CTA here — the create form is right beside it */}
          <GalleryGrid hasCreateCta={false} />
        </section>
      </div>
    </main>
  )
}
