// apps/web/src/modules/Cinema/components/CinemaLibrary.tsx
// The /cinema page body: the film library implementing the full 4-states rule
// (loading skeletons → error+retry → empty+CTA → grid of FilmCard) plus the
// "New film" modal. The route owns the page canvas; this owns the library.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, EmptyState, ErrorState, Skeleton } from 'shared/ui'
import { useFilms } from '../model/filmsApi'
import { FilmCard } from './FilmCard'
import { FilmSettingsModal } from './FilmSettingsModal'
import { PlusIcon } from './icons'

// Static keys for the fixed skeleton row — index keys are banned even here
const SKELETON_KEYS = ['s1', 's2', 's3', 's4']
const GRID = 'grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5'

export function CinemaLibrary() {
  const { t } = useTranslation()
  const { data, isPending, isError, refetch } = useFilms()
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  // Loading: canvas-shaped plates mirror the eventual FilmCard tiles
  if (isPending) {
    return (
      <div className={GRID}>
        {SKELETON_KEYS.map((key) => (
          <Skeleton key={key} className="aspect-video w-full" />
        ))}
      </div>
    )
  }

  if (isError) {
    return <ErrorState message={t('errors.loadFailed')} onRetry={() => void refetch()} />
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-normal text-white">{t('cinema.title')}</h1>
        <Button onClick={() => setIsCreateOpen(true)}>
          <PlusIcon />
          {t('cinema.new')}
        </Button>
      </div>

      {data.items.length === 0 ? (
        <EmptyState
          title={t('cinema.empty.title')}
          description={t('cinema.empty.description')}
          action={<Button onClick={() => setIsCreateOpen(true)}>{t('cinema.new')}</Button>}
        />
      ) : (
        <ul className={GRID}>
          {data.items.map((film) => (
            <li key={film.id}>
              <FilmCard film={film} />
            </li>
          ))}
        </ul>
      )}

      {/* One modal, create mode (film=null); it navigates into the new editor */}
      <FilmSettingsModal film={null} isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
    </div>
  )
}
