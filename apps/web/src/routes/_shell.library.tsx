// apps/web/src/routes/_shell.library.tsx
// Library screen ('/library', inside the AppShell layout since Task 18) —
// auth-guarded personal gallery with client-side type filter chips.
// Composition only: the Gallery module owns list/polling/delete logic; the
// route holds just the page-local filter selection. The shell owns the page
// canvas (bg-void + min-height), so the screen only lays out its content.
import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { requireSession } from 'modules/Auth'
import { GalleryFilterChips, GalleryGrid } from 'modules/Gallery'
import type { GalleryFilter } from 'modules/Gallery'
import { useCatalog } from 'modules/Generator'

export const Route = createFileRoute('/_shell/library')({
  beforeLoad: () => requireSession(),
  component: LibraryPage,
})

function LibraryPage() {
  const { t } = useTranslation()
  // Page-local UI state — deliberately NOT in a store: leaving and returning
  // to the library should always start from "All"
  const [filter, setFilter] = useState<GalleryFilter>('all')
  // The SAME ['catalog'] cache entry the composer uses — one fetch per session,
  // and this screen has no composer at all. It is read for ONE reason: the
  // detail viewer names the model that made a result, and Gallery may not
  // import the Generator's catalog query itself (cross-module law), so the
  // route is the seam — exactly as /create does it for the filter bar.
  const catalog = useCatalog()
  const modelOptions = (catalog.data?.models ?? []).map((model) => ({
    id: model.id,
    name: model.name,
  }))

  return (
    // Full-bleed like /create — both are gallery workbenches and share the
    // shell bar's gutter; a centered column would orphan the header alignment
    <main className="flex w-full flex-col gap-8 px-6 py-8 xl:px-10">
      {/* Mono weight-400 30px page title over the closing white/10 hairline —
          the same terminal opener as /create and /pricing (brief QA #6) */}
      <h1 className="border-b border-white/10 pb-6 text-3xl font-normal text-white">
        {t('gallery.title')}
      </h1>
      <GalleryFilterChips value={filter} onChange={setFilter} />
      {/* No onRegenerate: there is no composer on this screen, so the Edit
          action correctly does not appear in the menus here */}
      <GalleryGrid filter={filter} models={modelOptions} />
    </main>
  )
}
