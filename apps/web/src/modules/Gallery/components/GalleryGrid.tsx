// apps/web/src/modules/Gallery/components/GalleryGrid.tsx
// The generations grid (4-states rule): 8 skeleton cards → ErrorState with
// retry → EmptyState with a create CTA → cards + "Load more" while the API
// reports a nextCursor. Filtering by type is client-side over loaded pages.
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import type { AspectRatio, Generation } from '@opencreate/contracts'
import { Button, EmptyState, ErrorState, Skeleton } from 'shared/ui'
import { useGenerations } from '../model/generationsApi'
import type { GalleryView, GridSize } from '../model/viewSettings'
import { GRID_SIZE_CLASSES, useViewSettings } from '../model/viewSettings'
import { GenerationCard } from './GenerationCard'
import { GenerationRow } from './GenerationRow'

// Client-side type filter (library page chips); 'all' shows everything
export type GalleryFilter = 'all' | 'image' | 'video'

export type GalleryGridProps = {
  // Narrow the loaded items by type; defaults to everything
  filter?: GalleryFilter
  // Narrow to one catalog model; null/undefined = any model
  modelId?: string | null
  // Narrow to one output shape; null/undefined = any ratio
  aspectRatio?: AspectRatio | null
  // The create page embeds the grid next to the form — a CTA to /create there
  // would point at itself, so the page can turn it off
  hasCreateCta?: boolean
  // Refill the composer from a generation. Passed straight down to every card /
  // row; absent on /library, where the Regenerate action then does not appear.
  onRegenerate?: (generation: Generation) => void
}

// Static keys for the fixed skeleton row — index keys are banned even here
const SKELETON_KEYS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8']

// Skeletons stay in the default md ramp — the real column count arrives with
// the data, and guessing it while loading would only add a layout jump
const SKELETON_GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'

type GalleryItemsProps = {
  // Already filtered — this component only decides the SHAPE of the list
  items: Generation[]
  view: GalleryView
  gridSize: GridSize
  onRegenerate?: ((generation: Generation) => void) | undefined
}

// The three shapes of the same feed. Split out of GalleryGrid so the 4-states
// logic above (loading/error/empty/data) stays readable and does not grow a
// three-way branch inside its own return.
function GalleryItems({ items, view, gridSize, onRegenerate }: GalleryItemsProps) {
  const { t } = useTranslation()

  if (view === 'table') {
    return (
      // The table can outgrow a narrow viewport horizontally — it scrolls in
      // its OWN container so the page body never scrolls sideways
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          {/* A caption, not a visible heading: the section already has one, but
              a table without an accessible name is a wall of cells to a reader */}
          <caption className="sr-only">{t('gallery.title')}</caption>
          <thead>
            <tr className="border-b border-white/10 text-xs text-mist-dim">
              <th scope="col" className="px-3 py-2 font-normal">
                <span className="sr-only">{t('gallery.table.preview')}</span>
              </th>
              <th scope="col" className="px-3 py-2 font-normal">
                {t('generator.prompt.label')}
              </th>
              <th scope="col" className="px-3 py-2 font-normal">
                {t('gallery.table.status')}
              </th>
              <th scope="col" className="px-3 py-2 font-normal">
                {t('generator.type.label')}
              </th>
              <th scope="col" className="px-3 py-2 font-normal">
                {t('generator.model.label')}
              </th>
              <th scope="col" className="px-3 py-2 font-normal">
                {t('generator.aspect.label')}
              </th>
              <th scope="col" className="px-3 py-2 font-normal">
                {t('gallery.table.cost')}
              </th>
              <th scope="col" className="px-3 py-2 font-normal">
                {t('gallery.table.created')}
              </th>
              <th scope="col" className="px-3 py-2 font-normal">
                <span className="sr-only">{t('gallery.table.actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((generation) => (
              <GenerationRow
                key={generation.id}
                generation={generation}
                {...(onRegenerate ? { onRegenerate } : {})}
              />
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (view === 'slide') {
    return (
      // One frame at a time: a scroll-snap rail. snap-center + a wide item makes
      // the browser do the carousel — no JS, no index state, and the native
      // scrollbar/keyboard/trackpad all keep working.
      <ul className="-mx-2 flex snap-x snap-mandatory gap-4 overflow-x-auto px-2 pb-2">
        {items.map((generation) => (
          <li key={generation.id} className="w-[min(85vw,32rem)] shrink-0 snap-center">
            <GenerationCard
              generation={generation}
              {...(onRegenerate ? { onRegenerate } : {})}
            />
          </li>
        ))}
      </ul>
    )
  }

  return (
    <ul className={`grid gap-4 ${GRID_SIZE_CLASSES[gridSize]}`}>
      {items.map((generation) => (
        <li key={generation.id}>
          <GenerationCard generation={generation} {...(onRegenerate ? { onRegenerate } : {})} />
        </li>
      ))}
    </ul>
  )
}

export function GalleryGrid({
  filter = 'all',
  modelId = null,
  aspectRatio = null,
  hasCreateCta = true,
  onRegenerate,
}: GalleryGridProps) {
  const { t } = useTranslation()
  // Display preference, not filter state — it outlives the visit (persisted)
  const view = useViewSettings((state) => state.view)
  const gridSize = useViewSettings((state) => state.gridSize)
  const { data, isPending, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useGenerations()

  // Loading: 8 figure-shaped skeletons mirror the eventual media plates
  // (the shared Skeleton's stepped surface pulse — never a gradient shimmer).
  // rounded-2xl is the well's radius: the skeleton must be the same silhouette
  // the media lands in, or the whole grid re-corners itself when data arrives.
  if (isPending) {
    return (
      <div className={SKELETON_GRID}>
        {SKELETON_KEYS.map((key) => (
          <Skeleton key={key} className="aspect-square w-full rounded-2xl" />
        ))}
      </div>
    )
  }

  if (isError) {
    return <ErrorState message={t('errors.loadFailed')} onRetry={() => void refetch()} />
  }

  const loaded = data.pages.flatMap((page) => page.items)
  // Every filter is an AND, and each null/'all' is a no-op — so the predicate
  // reads the same whether zero or three filters are engaged
  const items = loaded.filter(
    (generation) =>
      (filter === 'all' || generation.type === filter) &&
      (modelId === null || generation.modelId === modelId) &&
      (aspectRatio === null || generation.params.aspectRatio === aspectRatio),
  )

  // "Nothing matches your filters" is a DIFFERENT dead end than "you have not
  // created anything yet". The first is the user's own doing and is undone by
  // clearing a dropdown; offering a Create CTA there would be a non-sequitur.
  if (items.length === 0 && loaded.length > 0) {
    return (
      <EmptyState
        title={t('gallery.noMatches.title')}
        description={t('gallery.noMatches.description')}
      />
    )
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title={t('gallery.empty.title')}
        description={t('gallery.empty.description')}
        action={
          hasCreateCta ? (
            // Link styled as the primary Button (same convention as
            // NotFoundPage): GREEN specimen pill — creating is THE green action
            <Link
              to="/create"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-white/10 bg-specimen-green/20 px-5 py-2 text-sm font-medium text-glow-green shadow-pill transition-colors duration-200 hover:bg-specimen-green/35 focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
            >
              {t('gallery.empty.cta')}
            </Link>
          ) : undefined
        }
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <GalleryItems items={items} view={view} gridSize={gridSize} onRegenerate={onRegenerate} />
      {hasNextPage ? (
        <Button
          variant="ghost"
          onClick={() => void fetchNextPage()}
          isLoading={isFetchingNextPage}
          className="self-center"
        >
          {t('gallery.loadMore')}
        </Button>
      ) : null}
    </div>
  )
}
