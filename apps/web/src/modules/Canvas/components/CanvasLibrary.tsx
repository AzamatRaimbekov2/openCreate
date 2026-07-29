// apps/web/src/modules/Canvas/components/CanvasLibrary.tsx
// The /canvas page body: the canvas list with the full 4-states rule
// (skeletons → error+retry → empty+CTA → card grid) plus the create action,
// which lands the user straight in the new board. The route owns the page
// canvas; this owns the library — the CinemaLibrary split.
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from '@tanstack/react-router'
import { Button, Card, EmptyState, ErrorState, Skeleton } from 'shared/ui'
import { useCanvases, useCreateCanvas } from '../model/api'

// Static keys for the fixed skeleton row — index keys are banned even here
const SKELETON_KEYS = ['s1', 's2', 's3']
const GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'

export function CanvasLibrary() {
  const { t, i18n } = useTranslation()
  const { data, isPending, isError, refetch } = useCanvases()
  const create = useCreateCanvas()
  const navigate = useNavigate()

  // A new canvas is empty by definition, so there is nothing to configure up
  // front: create it and open it. Renaming happens in the editor header.
  const handleCreate = () => {
    create.mutate(t('canvas.untitled'), {
      onSuccess: (created) =>
        void navigate({ to: '/canvas/$canvasId', params: { canvasId: created.id } }),
    })
  }

  const header = (
    <div className="flex items-center justify-between gap-4">
      <h1 className="text-3xl font-normal text-white">{t('canvas.title')}</h1>
      <Button onClick={handleCreate} isLoading={create.isPending}>
        {t('canvas.new')}
      </Button>
    </div>
  )

  if (isPending) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <div className={GRID}>
          {SKELETON_KEYS.map((key) => (
            <div key={key} className="flex flex-col gap-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <ErrorState message={t('canvas.listError')} onRetry={() => void refetch()} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {header}
      {data.items.length === 0 ? (
        <EmptyState
          title={t('canvas.empty.title')}
          description={t('canvas.empty.description')}
          action={
            <Button onClick={handleCreate} isLoading={create.isPending}>
              {t('canvas.new')}
            </Button>
          }
        />
      ) : (
        <ul className={GRID}>
          {data.items.map((item) => (
            <li key={item.id}>
              {/* The whole card is a typed Link into the editor; the lift lives
                  on the link so the Card keeps its surface styling untouched. */}
              <Link
                to="/canvas/$canvasId"
                params={{ canvasId: item.id }}
                className="group block rounded-2xl transition-transform duration-200 focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none motion-safe:hover:-translate-y-0.5"
              >
                <Card className="flex h-full flex-col gap-2">
                  <span className="truncate text-sm font-medium text-white">{item.title}</span>
                  <span className="text-xs text-mist-dim">
                    {t('cinema.card.updated', {
                      date: new Intl.DateTimeFormat(i18n.language, {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      }).format(new Date(item.updatedAt)),
                    })}
                  </span>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
