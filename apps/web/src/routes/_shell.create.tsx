// apps/web/src/routes/_shell.create.tsx
// Create screen ('/create') — auth-guarded (beforeLoad bounces signed-out
// visitors to /login before anything mounts).
//
// LAYOUT: a chat, not a form. Inside the shell's viewport:
//   [ filter header ]  — sticky, never scrolls away
//   [ media feed    ]  — the ONLY scroll container on the page
//   [ composer      ]  — a floating glass capsule OVERLAYING the feed's foot
// The page therefore never grows past the viewport; the feed scrolls inside it.
// That is what makes a submit feel like sending a message: the new card lands
// at the top of a feed you are already looking at, with the pen still under
// your cursor. A page-scrolling layout would push the composer off-screen the
// moment the library filled up — the exact failure of the old two-column form.
//
// The composer OVERLAYS rather than docks (it is absolutely positioned, not a
// flex row). This is what buys the iOS glass read: a backdrop-filter has
// nothing to blur unless content actually passes beneath it. A docked bar sits
// next to the feed and would frost empty background — the effect only exists
// while media slides under the capsule. The feed pays for this with pb-40, so
// its last row can still scroll clear of the glass instead of hiding forever.
//
// h-[calc(100dvh-…)] uses dvh, not vh: on mobile Safari, vh includes the
// retracted URL bar, so the dock would sit below the fold until the user
// scrolled. The subtracted 4rem is the AppShell header's height.
//
// Composition only. Filters live in local state here (never in the store) —
// they are a VIEW concern of this screen, and the Generator's draft store must
// not learn what the user is currently browsing.
import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { requireSession } from 'modules/Auth'
import { GalleryFilterBar, GalleryGrid, ViewSettingsMenu } from 'modules/Gallery'
import type { GalleryFilters } from 'modules/Gallery'
import { ChatComposer, useCatalog, usePrefillDraft } from 'modules/Generator'
import { useEntities } from 'modules/Entities'

export const Route = createFileRoute('/_shell/create')({
  beforeLoad: () => requireSession(),
  component: CreatePage,
})

const INITIAL_FILTERS: GalleryFilters = { type: 'all', modelId: null, aspectRatio: null }

function CreatePage() {
  const { t } = useTranslation()
  const [filters, setFilters] = useState<GalleryFilters>(INITIAL_FILTERS)
  // The route already needs the catalog for the composer's model list; reading
  // it here costs nothing (same ['catalog'] cache entry) and lets Gallery stay
  // ignorant of the Generator module. Names only — the filter sees no prices.
  const catalog = useCatalog()
  // Wires Gallery's "Regenerate" card action to the Generator's draft store.
  // The route is the ONLY place allowed to know both modules exist.
  const prefillDraft = usePrefillDraft()
  // The composer's mention picker taggable list. Read HERE so Generator never
  // imports modules/Entities — the route is the seam (as with onRegenerate).
  const entitiesQuery = useEntities()
  const taggableEntities = (entitiesQuery.data?.items ?? []).map((e) => ({ id: e.id, name: e.name }))
  const modelOptions = (catalog.data?.models ?? []).map((model) => ({
    id: model.id,
    name: model.name,
  }))

  return (
    // `relative` anchors the floating composer; `overflow-hidden` keeps the
    // capsule's blur from bleeding past the page into the shell header
    <main className="relative flex h-[calc(100dvh-4rem)] flex-col overflow-hidden">
      {/* Filter header on the void, closed by a hairline. The gear is pushed to
          the far right: filters are the frequent controls and keep the natural
          left-to-right reading order; display preferences are the rare ones. */}
      <header className="flex shrink-0 items-end gap-4 border-b border-white/10 px-6 py-4 xl:px-10">
        <h1 className="sr-only">{t('generator.title')}</h1>
        <div className="min-w-0 flex-1">
          <GalleryFilterBar value={filters} onChange={setFilters} models={modelOptions} />
        </div>
        <ViewSettingsMenu />
      </header>

      {/* The feed. min-h-0 is load-bearing: without it a flex child refuses to
          shrink below its content and the scroll never engages. pb-40 reserves
          a runway so the final row clears the floating capsule. */}
      <section
        aria-label={t('gallery.title')}
        className="min-h-0 flex-1 overflow-y-auto px-6 pt-6 pb-40 xl:px-10"
      >
        {/* No create CTA — the composer floats directly over this feed */}
        <GalleryGrid
          filter={filters.type}
          modelId={filters.modelId}
          aspectRatio={filters.aspectRatio}
          hasCreateCta={false}
          onRegenerate={prefillDraft}
        />
      </section>

      {/* The floating composer. The wrapper spans the page but is click-through
          (pointer-events-none) so the feed stays scrollable to its very edges;
          the capsule itself re-enables pointer events. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-4 pb-5">
        <ChatComposer taggableEntities={taggableEntities} />
      </div>
    </main>
  )
}
