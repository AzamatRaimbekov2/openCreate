// apps/web/src/modules/Soul/components/SoulCard.tsx
// The character's page: the reference sheet, what it IS, and how to bring it to
// life. Composition + the four states over ONE entity — everything paid lives in
// its children (SoulSheet, SoulAnimate), so this file stays about layout and
// about the two ways a soul card can legitimately not render:
//
//   · the entity is gone / not ours → a calm localized error, never a blank page;
//   · the entity has no soul (an object, a legacy upload) → this is the wrong
//     screen for it, and saying so beats crashing on `entity.soul.styleId`.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import type { CatalogModel } from '@opencreate/contracts'
import { Button, ErrorState, Skeleton } from 'shared/ui'
import { useSoulEntity } from '../model/soulApi'
import { SoulAnimate } from './SoulAnimate'
import { SoulEditModal } from './SoulEditModal'
import { SoulFacts } from './SoulFacts'
import { SoulSheet } from './SoulSheet'

export type SoulCardProps = {
  // From the route param
  entityId: string
  // The catalog, read by the ROUTE (Soul must not import Generator — the route is
  // the seam, exactly as /cinema/$filmId feeds FilmEditor)
  models: CatalogModel[]
}

export function SoulCard({ entityId, models }: SoulCardProps) {
  const { t } = useTranslation()
  const { data: entity, isPending, isError, refetch } = useSoulEntity(entityId)
  const [isEditing, setIsEditing] = useState(false)

  if (isPending) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    )
  }

  if (isError) {
    return <ErrorState message={t('soul.errors.notFound')} onRetry={() => void refetch()} />
  }

  if (entity.soul == null) {
    // A real entity, but not a soul-built one: /entities is its home
    return <ErrorState message={t('soul.errors.notSoul')} />
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to="/soul"
            className="rounded-lg px-1 text-sm text-portal underline decoration-portal/40 underline-offset-4 hover:decoration-portal focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
          >
            {t('soul.card.back')}
          </Link>
          <h1 className="text-3xl font-normal text-white">{entity.name}</h1>
        </div>
        <Button variant="ghost" onClick={() => setIsEditing(true)}>
          {t('soul.card.edit')}
        </Button>
      </header>

      {/* The sheet is the hero of this page — it spans, the facts sit beside it */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <SoulSheet entity={entity} models={models} />
          <SoulAnimate entity={entity} models={models} />
        </div>
        <SoulFacts soul={entity.soul} />
      </div>

      {/* Mounted only while open, so each edit starts from the SAVED soul */}
      {isEditing ? (
        <SoulEditModal entity={entity} isOpen onClose={() => setIsEditing(false)} />
      ) : null}
    </div>
  )
}
