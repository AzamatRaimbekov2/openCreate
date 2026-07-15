// apps/web/src/modules/Soul/components/SoulCharacters.tsx
// The user's own characters, as a grid of cover plates that lead into the soul
// card. Four states over the SHARED ['entities'] query (loading skeletons →
// error+retry → empty → data), filtered to the ones that actually have a soul —
// /entities still owns objects, places and plain uploads.
//
// A cover photo is CONTENT, not chrome: the tile is a recessed `well` Card, never
// frosted glass (design.md §3.5 — the same reasoning as GenerationCard). A face
// the user paid 26 credits for must read as a face.
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { Card, EmptyState, ErrorState, Skeleton } from 'shared/ui'
import { useSoulCharacters } from '../model/soulApi'

const SKELETON_KEYS = ['s1', 's2', 's3', 's4', 's5', 's6']
const GRID = 'grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6'

export function SoulCharacters() {
  const { t } = useTranslation()
  const { data, isPending, isError, refetch } = useSoulCharacters()

  if (isPending) {
    return (
      <div className={GRID}>
        {/* rounded-2xl = the well's radius, so the grid keeps its silhouette when
            the real plates land */}
        {SKELETON_KEYS.map((key) => (
          <Skeleton key={key} className="aspect-square w-full rounded-2xl" />
        ))}
      </div>
    )
  }

  if (isError) {
    return <ErrorState message={t('errors.loadFailed')} onRetry={() => void refetch()} />
  }

  if (data.length === 0) {
    return (
      <EmptyState
        title={t('soul.characters.empty.title')}
        description={t('soul.characters.empty.description')}
      />
    )
  }

  return (
    <ul className={GRID}>
      {data.map((entity) => {
        const cover = entity.images.find((image) => image.id === entity.primaryImageId)
        return (
          <li key={entity.id} className="flex flex-col gap-2">
            <Card
              surface="well"
              padding="none"
              className="overflow-hidden transition-transform duration-200 motion-safe:hover:-translate-y-0.5"
            >
              {/* The Link sits INSIDE the well (Card renders a <div>), so the plate
                  owns the hover lift and the link owns an INSET focus ring — an
                  outset ring would be clipped by overflow-hidden */}
              <Link
                to="/soul/$entityId"
                params={{ entityId: entity.id }}
                className="block aspect-square w-full focus-visible:ring-2 focus-visible:ring-portal focus-visible:ring-inset focus-visible:outline-none"
              >
                {cover ? (
                  <img src={cover.url} alt={entity.name} className="size-full object-cover" />
                ) : (
                  // A character with no portrait yet is the NORMAL first state —
                  // creation is free, the photo is the paid act
                  <span className="flex size-full items-center justify-center px-2 text-center text-xs text-mist-dim">
                    {t('soul.characters.noPhoto')}
                  </span>
                )}
              </Link>
            </Card>
            <p className="truncate text-sm font-medium text-white">{entity.name}</p>
          </li>
        )
      })}
    </ul>
  )
}
