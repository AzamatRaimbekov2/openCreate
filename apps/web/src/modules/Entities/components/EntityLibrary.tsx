// apps/web/src/modules/Entities/components/EntityLibrary.tsx
// The /entities page body: the 4-states list (loading skeletons → error+retry →
// empty+CTA → grid) plus the create/edit modal. The route owns the page canvas;
// this owns the library itself.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Entity } from '@opencreate/contracts'
import { Button, EmptyState, ErrorState, Menu, Skeleton } from 'shared/ui'
import { useDeleteEntity, useEntities } from '../model/entitiesApi'
import { EntityEditor } from './EntityEditor'

const SKELETON_KEYS = ['s1', 's2', 's3', 's4', 's5', 's6']
const GRID = 'grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6'

export function EntityLibrary() {
  const { t } = useTranslation()
  const { data, isPending, isError, refetch } = useEntities()
  const deleteMutation = useDeleteEntity()
  // null-but-open = create; an entity-and-open = edit. One modal, two modes.
  const [editing, setEditing] = useState<Entity | null>(null)
  const [isEditorOpen, setIsEditorOpen] = useState(false)

  const openCreate = () => {
    setEditing(null)
    setIsEditorOpen(true)
  }
  const openEdit = (entity: Entity) => {
    setEditing(entity)
    setIsEditorOpen(true)
  }

  if (isPending) {
    return (
      <div className={GRID}>
        {SKELETON_KEYS.map((key) => (
          <Skeleton key={key} className="aspect-square w-full rounded-xl" />
        ))}
      </div>
    )
  }

  if (isError) {
    return <ErrorState message={t('errors.loadFailed')} onRetry={() => void refetch()} />
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-normal text-white">{t('entities.title')}</h1>
        <Button onClick={openCreate}>{t('entities.create.cta')}</Button>
      </div>

      {data.items.length === 0 ? (
        <EmptyState
          title={t('entities.empty.title')}
          description={t('entities.empty.description')}
          action={<Button onClick={openCreate}>{t('entities.create.cta')}</Button>}
        />
      ) : (
        <ul className={GRID}>
          {data.items.map((entity) => {
            const cover = entity.images.find((image) => image.id === entity.primaryImageId)
            return (
              <li key={entity.id} className="group relative flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => openEdit(entity)}
                  className="aspect-square w-full overflow-hidden rounded-xl border border-white/10 bg-abyss transition-transform duration-200 focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none motion-safe:hover:-translate-y-0.5"
                >
                  {cover ? (
                    <img src={cover.url} alt={entity.name} className="size-full object-cover" />
                  ) : (
                    // No photo yet — a quiet placeholder that still opens the editor
                    <span className="flex size-full items-center justify-center text-xs text-mist-dim">
                      {t('entities.noPhoto')}
                    </span>
                  )}
                </button>
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{entity.name}</p>
                    <p className="text-xs text-mist-dim">{t(`entities.kind.${entity.kind}`)}</p>
                  </div>
                  <Menu
                    label={t('gallery.actions.label')}
                    items={[
                      { id: 'edit', label: t('common.edit'), onSelect: () => openEdit(entity) },
                      {
                        id: 'delete',
                        label: t('gallery.delete'),
                        variant: 'danger',
                        onSelect: () => deleteMutation.mutate(entity.id),
                      },
                    ]}
                    triggerClassName="flex size-8 shrink-0 items-center justify-center rounded-full text-mist-dim transition-colors duration-200 hover:bg-ridge hover:text-white focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
                  >
                    <span aria-hidden="true">⋯</span>
                  </Menu>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <EntityEditor entity={editing} isOpen={isEditorOpen} onClose={() => setIsEditorOpen(false)} />
    </div>
  )
}
