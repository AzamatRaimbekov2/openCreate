// apps/web/src/modules/Gallery/components/GalleryGrid.tsx
// The generations grid (4-states rule): 8 skeleton cards → ErrorState with
// retry → EmptyState with a create CTA → cards + "Load more" while the API
// reports a nextCursor. Filtering by type is client-side over loaded pages.
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button, EmptyState, ErrorState, Skeleton } from 'shared/ui'
import { useGenerations } from '../model/generationsApi'
import { GenerationCard } from './GenerationCard'

// Client-side type filter (library page chips); 'all' shows everything
export type GalleryFilter = 'all' | 'image' | 'video'

export type GalleryGridProps = {
  // Narrow the loaded items by type; defaults to everything
  filter?: GalleryFilter
  // The create page embeds the grid next to the form — a CTA to /create there
  // would point at itself, so the page can turn it off
  hasCreateCta?: boolean
}

// Static keys for the fixed skeleton row — index keys are banned even here
const SKELETON_KEYS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8']

const gridClasses = 'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3'

export function GalleryGrid({ filter = 'all', hasCreateCta = true }: GalleryGridProps) {
  const { t } = useTranslation()
  const { data, isPending, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useGenerations()

  // Loading: 8 figure-shaped skeletons mirror the eventual media plates
  // (the shared Skeleton's stepped surface pulse — never a gradient shimmer)
  if (isPending) {
    return (
      <div className={gridClasses}>
        {SKELETON_KEYS.map((key) => (
          <Skeleton key={key} className="aspect-square w-full" />
        ))}
      </div>
    )
  }

  if (isError) {
    return <ErrorState message={t('errors.loadFailed')} onRetry={() => void refetch()} />
  }

  const items = data.pages
    .flatMap((page) => page.items)
    .filter((generation) => filter === 'all' || generation.type === filter)

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
      <ul className={gridClasses}>
        {items.map((generation) => (
          <li key={generation.id}>
            <GenerationCard generation={generation} />
          </li>
        ))}
      </ul>
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
