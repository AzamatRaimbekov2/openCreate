// apps/web/src/routes/_shell.create.tsx
// Create screen ('/create', inside the AppShell layout since Task 18) —
// auth-guarded (beforeLoad bounces signed-out visitors to /login before
// anything mounts). Composition only: form left, live gallery right — a submit
// prepends its card next door instantly, which is the module pair's success
// feedback (no toast in the kit by design). The shell owns the page canvas
// (bg-void + min-height), so the screen only lays out its own content.
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
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-10 md:py-14">
      {/* Mono weight-400 30px page title (the v3 heading law) — app screens
          speak in the same terminal voice as the landing/pricing (brief QA #6:
          /create and /library must visibly belong to the same brand) */}
      <h1 className="text-3xl font-normal text-white">{t('generator.title')}</h1>
      {/* Mobile stacks (form first); desktop pins the form to a readable
          26rem column and gives the gallery the rest */}
      <div className="grid gap-10 lg:grid-cols-[26rem_minmax(0,1fr)] lg:items-start">
        <GeneratorPanel />
        <section aria-label={t('gallery.title')} className="flex flex-col gap-5">
          {/* Section heading over a white/10 hairline — the gallery column is
              the page's second "section" in the terminal rhythm */}
          <h2 className="border-b border-white/10 pb-3 text-2xl font-normal text-white">
            {t('gallery.title')}
          </h2>
          {/* No create CTA here — the create form is right beside it */}
          <GalleryGrid hasCreateCta={false} />
        </section>
      </div>
    </main>
  )
}
