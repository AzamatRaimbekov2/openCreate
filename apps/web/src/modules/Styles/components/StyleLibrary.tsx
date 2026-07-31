// apps/web/src/modules/Styles/components/StyleLibrary.tsx
// The /styles page body: the 4-states registry (skeletons → error+retry →
// "none of your own" → the grid) plus the constructor modal and the delete
// confirm. The route owns the page canvas; this owns the library.
//
// TWO SECTIONS, ONE SOURCE. The server answers with builtin styles and the
// caller's own in a single list (ADR style-studio D1); this splits them for
// display only. MINE LEADS — the builtins are a reference shelf you read, the
// styles you wrote are the ones you came here to manage.
//
// v4 SURFACE: a style's preview is content, so its plate is a recessed `well`
// Card — the same material a Gallery generation and an Entities cover use.
// Frosted glass is reserved for chrome floating over media.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CatalogModel, Style } from '@opencreate/contracts'
import { Badge, Button, Card, EmptyState, ErrorState, Menu, Modal, Skeleton } from 'shared/ui'
import { useDeleteStyle, useStylePreview, useStyles } from '../model/api'
import { StyleEditor } from './StyleEditor'

export type StyleLibraryProps = {
  // The model catalog, injected FROM THE ROUTE — this module must not import
  // Generator (the seam cinema.$filmId already uses for catalog/templates).
  // The editor needs it twice: to offer a recommended model, and to price the
  // preview button from that model's own credits.
  models: CatalogModel[]
}

const SKELETON_KEYS = ['s1', 's2', 's3', 's4', 's5', 's6']
const GRID = 'grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6'

export function StyleLibrary({ models }: StyleLibraryProps) {
  const { t } = useTranslation()
  const { data, isPending, isError, refetch } = useStyles()
  const deleteStyle = useDeleteStyle()
  // The preview run lives HERE, not in the editor: it is a paid generation that
  // takes seconds to minutes, and this page outlives the modal. A poll owned by
  // the modal would die on close and strand a charged run with nothing left to
  // attach it to (see StyleEditor's note).
  const preview = useStylePreview()
  // null-but-open = create; a style-and-open = edit. One modal, two modes —
  // the EntityEditor precedent, and for the same reason: identical fields.
  const [editing, setEditing] = useState<Style | null>(null)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  // The style awaiting confirmation. Held as the whole row so the dialog can
  // name it, and so a list refresh mid-dialog cannot swap which one is meant.
  const [pendingDelete, setPendingDelete] = useState<Style | null>(null)

  const openCreate = () => {
    setEditing(null)
    setIsEditorOpen(true)
  }
  const openEdit = (style: Style) => {
    setEditing(style)
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

  const mine = data.items.filter((style) => !style.builtin)
  const builtin = data.items.filter((style) => style.builtin)

  const renderTile = (style: Style) => {
    // A deterministic id (not useId — this runs inside a map) so the <li> can
    // be labelled by the name it displays instead of repeating it in aria-label.
    const nameId = `style-name-${style.id}`
    return (
      <li key={style.id} aria-labelledby={nameId} className="flex flex-col gap-2">
        <Card surface="well" padding="none" className="overflow-hidden">
          <div className="flex aspect-square w-full items-center justify-center">
            {/* The sample is NAMED, not decorative (the EntityLibrary cover
                precedent): it is the tile's content, and a screen reader should
                find it as this style's image rather than skip it entirely. */}
            {style.previewUrl ? (
              <img src={style.previewUrl} alt={style.name} className="size-full object-cover" />
            ) : (
              // No preview yet — a quiet placeholder, never an empty plate
              <span className="px-3 text-center text-xs text-mist-dim">
                {t('styles.noPreview')}
              </span>
            )}
          </div>
        </Card>
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0">
            <p id={nameId} className="truncate text-sm font-medium text-white">
              {style.name}
            </p>
            {/* The fragment IS the style — showing it is what lets a user read a
                builtin and write a better one (contracts style.ts: fragments are
                exposed on purpose) */}
            <p className="truncate text-xs text-mist-dim">{style.fragment}</p>
          </div>
          {style.builtin ? (
            <Badge>{t('styles.builtinBadge')}</Badge>
          ) : (
            <Menu
              label={t('gallery.actions.label')}
              items={[
                { id: 'edit', label: t('common.edit'), onSelect: () => openEdit(style) },
                {
                  id: 'delete',
                  label: t('gallery.delete'),
                  variant: 'danger',
                  onSelect: () => setPendingDelete(style),
                },
              ]}
              triggerClassName="flex size-8 shrink-0 items-center justify-center rounded-full text-mist-dim transition-colors duration-200 hover:bg-ridge hover:text-white focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
            >
              <span aria-hidden="true">⋯</span>
            </Menu>
          )}
        </div>
      </li>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-normal text-white">{t('styles.title')}</h1>
          <p className="max-w-xl text-sm text-mist-dim">{t('styles.subtitle')}</p>
        </div>
        <Button onClick={openCreate}>{t('styles.create.cta')}</Button>
      </div>

      {/* MINE — the reason this page exists. The list is never literally empty
          (the builtins always arrive), so the empty state is about ownership. */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xs text-mist-dim">{t('styles.mine')}</h2>
        {mine.length === 0 ? (
          <EmptyState
            title={t('styles.empty.title')}
            description={t('styles.empty.description')}
            action={<Button onClick={openCreate}>{t('styles.create.cta')}</Button>}
          />
        ) : (
          <ul className={GRID}>{mine.map(renderTile)}</ul>
        )}
      </section>

      {/* BUILTIN — the reference shelf: read one, then write a better one */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xs text-mist-dim">{t('styles.builtinSection')}</h2>
        <ul className={GRID}>{builtin.map(renderTile)}</ul>
      </section>

      <StyleEditor
        style={editing}
        models={models}
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        // The editor saves and hands the SAVED row over; the run is ours.
        onPreview={preview.start}
        isPreviewPending={editing !== null && preview.pendingStyleId === editing.id}
      />

      {/* Deleting is confirmed because the blast radius is invisible from here:
          the style vanishes from every picker in the app, and any film or shot
          already pointing at it will ask for a style again at its next run. */}
      <Modal
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title={t('styles.delete.title')}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-mist-dim">{t('styles.delete.description')}</p>
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              isLoading={deleteStyle.isPending}
              onClick={() => {
                if (pendingDelete === null) return
                deleteStyle.mutate(pendingDelete.id, { onSuccess: () => setPendingDelete(null) })
              }}
            >
              {t('styles.delete.confirm')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
