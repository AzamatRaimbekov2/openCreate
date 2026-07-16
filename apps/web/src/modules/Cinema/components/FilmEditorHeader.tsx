// apps/web/src/modules/Cinema/components/FilmEditorHeader.tsx
// The editor's top bar: back-to-library link, film title + canvas chip, and the
// film overflow menu (rename → the settings modal in edit mode; delete → a
// destructive-confirm alertdialog per design.md §9 — a film is deleted only on
// the danger-pill confirm, never in one click). Split out of FilmEditor so the
// editor body stays pure layout.
import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import type { Film } from '@opencreate/contracts'
import { Badge, Button, Menu, Modal } from 'shared/ui'
import { useDeleteFilm } from '../model/filmsApi'
import { FilmSettingsModal } from './FilmSettingsModal'
import { ChevronLeftIcon } from './icons'

export type FilmEditorHeaderProps = {
  film: Film
  // Kick off the mp4 export (owned by FilmEditor — the status strip and this
  // menu must read one state). Lives in the ⋯ menu since v7: a once-per-film
  // action does not earn a standing card on the stage.
  onExport: () => void
  // False = hide the export item entirely (no shots, or one already in flight).
  // Menu law: unavailable actions are REMOVED, never disabled-and-mysterious.
  canExport: boolean
}

export function FilmEditorHeader({ film, onExport, canExport }: FilmEditorHeaderProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const deleteFilm = useDeleteFilm()
  const [isRenameOpen, setIsRenameOpen] = useState(false)
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)

  const confirmDelete = () =>
    deleteFilm.mutate(film.id, {
      onSuccess: () => {
        setIsConfirmOpen(false)
        void navigate({ to: '/cinema' })
      },
    })

  return (
    <header className="flex items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          to="/cinema"
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-mist-dim transition-colors duration-200 hover:bg-ridge hover:text-white focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
          aria-label={t('cinema.editor.back')}
        >
          <ChevronLeftIcon />
        </Link>
        {/* text-lg, not the page-title 2xl (v5): inside the editor the title is
            a label on a workbench, and every step of its size is a step the
            timeline + stage cannot use */}
        <h1 className="truncate text-lg font-normal text-white">{film.title}</h1>
        <Badge>{film.aspectRatio}</Badge>
      </div>

      <Menu
        label={t('cinema.editor.filmMenu')}
        items={[
          // Export first — it is the film's PRIMARY outcome; hidden (not
          // disabled) while a render runs or the timeline is empty
          {
            id: 'export',
            label: t('cinema.render.cta'),
            onSelect: onExport,
            isAvailable: canExport,
          },
          { id: 'rename', label: t('cinema.editor.rename'), onSelect: () => setIsRenameOpen(true) },
          {
            id: 'delete',
            label: t('cinema.editor.deleteFilm'),
            variant: 'danger',
            onSelect: () => setIsConfirmOpen(true),
          },
        ]}
        triggerClassName="flex size-8 items-center justify-center rounded-full text-mist-dim transition-colors duration-200 hover:bg-ridge hover:text-white focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
      >
        <span aria-hidden="true">⋯</span>
      </Menu>

      {/* Rename/aspect/style — the settings modal in edit mode */}
      <FilmSettingsModal film={film} isOpen={isRenameOpen} onClose={() => setIsRenameOpen(false)} />

      {/* Destructive confirm: the mutation fires only on the danger pill */}
      <Modal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        title={t('cinema.editor.deleteConfirm.title')}
        role="alertdialog"
      >
        <div className="flex flex-col gap-5">
          <p className="text-mist">{t('cinema.editor.deleteConfirm.body', { title: film.title })}</p>
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsConfirmOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={confirmDelete} isLoading={deleteFilm.isPending}>
              {t('cinema.editor.deleteConfirm.confirm')}
            </Button>
          </div>
        </div>
      </Modal>
    </header>
  )
}
