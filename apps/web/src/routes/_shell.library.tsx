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

export const Route = createFileRoute('/_shell/library')({
  beforeLoad: () => requireSession(),
  component: LibraryPage,
})

function LibraryPage() {
  const { t } = useTranslation()
  // Page-local UI state — deliberately NOT in a store: leaving and returning
  // to the library should always start from "All"
  const [filter, setFilter] = useState<GalleryFilter>('all')

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10 md:py-14">
      {/* Mono weight-400 30px page title over the closing white/10 hairline —
          the same terminal opener as /create and /pricing (brief QA #6) */}
      <h1 className="border-b border-white/10 pb-6 text-3xl font-normal text-white">
        {t('gallery.title')}
      </h1>
      <GalleryFilterChips value={filter} onChange={setFilter} />
      <GalleryGrid filter={filter} />
    </main>
  )
}
