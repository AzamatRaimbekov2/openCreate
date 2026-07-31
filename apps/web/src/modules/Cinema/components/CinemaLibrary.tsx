// apps/web/src/modules/Cinema/components/CinemaLibrary.tsx
// The /cinema page body: the film library implementing the full 4-states rule
// (loading skeletons → error+retry → empty+CTA → grid of FilmCard) plus the
// "New film" modal. The route owns the page canvas; this owns the library.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { Button, EmptyState, ErrorState, Skeleton } from 'shared/ui'
import { useFilms } from '../model/filmsApi'
import { FilmCard } from './FilmCard'
import { FilmSettingsModal } from './FilmSettingsModal'
import { PlusIcon } from './icons'

// Static keys for the fixed skeleton row — index keys are banned even here
const SKELETON_KEYS = ['s1', 's2', 's3', 's4']
const GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4'

// No props. The style registry used to arrive here for the New-film modal's
// default-style picker; create mode no longer poses that question (owner request
// 2026-07-31), so the seam is gone rather than left threading a value nobody
// reads. Editing a film's default style still happens in CinemaEditorHeader,
// which keeps its own `styles` prop from the route.
export function CinemaLibrary() {
  const { t } = useTranslation()
  const { data, isPending, isError, refetch } = useFilms()
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  // Loading: card-shaped silhouettes — the canvas plate plus its two meta lines,
  // so the grid does not reflow when the real FilmCards land.
  if (isPending) {
    return (
      <div className={GRID}>
        {SKELETON_KEYS.map((key) => (
          <div key={key} className="flex flex-col gap-3">
            <Skeleton className="aspect-video w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
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
        {/* Templates lead, "New film" is the ghost. An empty timeline is the
            harder path and the worse first experience — a user who has never made
            one of these does not know what eight beats of a cheating-fruit drama
            look like, and the catalog does. A plain <Link>: Cinema does not import
            Templates (see modules/Templates/index.ts on the module boundary). */}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" onClick={() => setIsCreateOpen(true)}>
            <PlusIcon />
            {t('cinema.new')}
          </Button>
          <Link to="/templates">
            <Button>{t('cinema.fromTemplate')}</Button>
          </Link>
        </div>
      </div>

      {data.items.length === 0 ? (
        <EmptyState
          title={t('cinema.empty.title')}
          description={t('cinema.empty.description')}
          action={
            <Link to="/templates">
              <Button>{t('cinema.fromTemplate')}</Button>
            </Link>
          }
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
      <FilmSettingsModal
        film={null}
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />
    </div>
  )
}
