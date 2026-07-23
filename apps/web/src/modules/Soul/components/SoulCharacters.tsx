// apps/web/src/modules/Soul/components/SoulCharacters.tsx
// The user's own characters, leading into the soul card. Four states over the
// SHARED ['entities'] query (loading skeletons → error+retry → empty → data),
// filtered to the ones that actually have a soul — /entities still owns objects,
// places and plain uploads.
//
// TWO layouts, ONE query. `grid` (the default) is the browsing plate wall;
// `rail` is the studio's narrow LEFT column (compact rows), added for the
// 2026-07-21 /soul recomposition. Both share the exact same 4 states — the
// variant only changes the DATA presentation, never the loading/error/empty
// contract, so the rail can never silently skip a state the grid handles.
//
// A cover photo is CONTENT, not chrome: the plate is a recessed `well` (design.md
// §3.5 — the same reasoning as GenerationCard). A face the user paid 26 credits
// for must read as a face.
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { Card, EmptyState, ErrorState, Skeleton } from 'shared/ui'
import { useSoulCharacters } from '../model/soulApi'

const SKELETON_KEYS = ['s1', 's2', 's3', 's4', 's5', 's6']
const RAIL_SKELETON_KEYS = ['r1', 'r2', 'r3', 'r4']
const GRID = 'grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6'

export type SoulCharactersProps = {
  // grid = the plate wall (default); rail = the studio's compact left column
  variant?: 'grid' | 'rail'
}

export function SoulCharacters({ variant = 'grid' }: SoulCharactersProps) {
  const { t } = useTranslation()
  const { data, isPending, isError, refetch } = useSoulCharacters()
  const isRail = variant === 'rail'

  if (isPending) {
    // The rail's skeleton is a stack of compact rows; the grid's is a plate wall.
    // Both keep the real layout's silhouette so nothing jumps when data lands.
    return isRail ? (
      <ul className="flex flex-col gap-2">
        {RAIL_SKELETON_KEYS.map((key) => (
          <li key={key}>
            <Skeleton className="h-14 w-full rounded-lg" />
          </li>
        ))}
      </ul>
    ) : (
      <div className={GRID}>
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

  if (isRail) {
    return (
      <ul className="flex flex-col gap-2">
        {data.map((entity) => {
          const cover = entity.images.find((image) => image.id === entity.primaryImageId)
          return (
            <li key={entity.id}>
              {/* A compact row: a small well thumbnail + the name, the whole row a
                  typed Link into the soul card (the paid portrait sheet lives
                  there — the studio never inlines minting). */}
              <Link
                to="/soul/$entityId"
                params={{ entityId: entity.id }}
                className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-white/5 p-1.5 pr-3 transition-colors duration-200 hover:bg-ridge focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
              >
                <span className="size-10 shrink-0 overflow-hidden rounded-md bg-abyss">
                  {cover ? (
                    <img src={cover.url} alt={entity.name} className="size-full object-cover" />
                  ) : (
                    <span className="flex size-full items-center justify-center text-center text-[10px] leading-tight text-mist-dim">
                      {t('soul.characters.noPhoto')}
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-white">{entity.name}</span>
              </Link>
            </li>
          )
        })}
      </ul>
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
