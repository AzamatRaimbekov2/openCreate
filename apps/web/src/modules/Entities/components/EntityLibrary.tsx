// apps/web/src/modules/Entities/components/EntityLibrary.tsx
// The /entities page body: the 4-states list (loading skeletons → error+retry →
// empty+CTA → grid) plus the create/edit modal. The route owns the page canvas;
// this owns the library itself.
//
// v4 SURFACE: an entity's cover photo is content, not chrome — the tile is a
// recessed `well` Card, exactly like a Gallery generation plate, so a face the
// user uploaded reads as a face and not as something sitting behind frosted
// glass. Frosted `glass` is reserved for chrome that floats OVER media.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Entity } from '@opencreate/contracts'
import { Button, Card, EmptyState, ErrorState, Menu, Skeleton } from 'shared/ui'
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
        {/* rounded-2xl = the well's radius, so the grid keeps its silhouette
            when the real tiles land */}
        {SKELETON_KEYS.map((key) => (
          <Skeleton key={key} className="aspect-square w-full rounded-2xl" />
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
                {/* The button lives INSIDE the well, not around it: a <button>
                    takes phrasing content, and Card renders a <div>. So the
                    plate owns the hover lift and the button owns the focus ring
                    — inset, because the well clips anything drawn outside it. */}
                <Card
                  surface="well"
                  padding="none"
                  className="overflow-hidden transition-transform duration-200 motion-safe:hover:-translate-y-0.5"
                >
                  <button
                    type="button"
                    onClick={() => openEdit(entity)}
                    className="block aspect-square w-full focus-visible:ring-2 focus-visible:ring-portal focus-visible:ring-inset focus-visible:outline-none"
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
                </Card>
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

      {/* KEYED, and it is load-bearing. EntityEditor seeds its fields with
          `useState(entity?.name ?? '')` — which runs once, at mount — and this
          component renders it PERMANENTLY (the Modal returns null while closed,
          but the component never unmounts). Without a key it mounted on the first
          render with `editing === null` and never re-seeded, so "edit" opened on
          a real entity showed its title and photos over EMPTY name/description.
          That is data loss, not just confusion: `handleSave` sends `description`
          as it finds it, so typing a name to re-enable the disabled Save button
          would silently overwrite the real description with ''. Same defect and
          same fix as StyleLibrary (de5ce6b). */}
      <EntityEditor
        key={editing?.id ?? 'new'}
        entity={editing}
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
      />
    </div>
  )
}
