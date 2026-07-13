// apps/web/src/modules/Cinema/components/FilmSettingsModal.tsx
// Create-or-edit a film in one modal (the Entities editor pattern: a null `film`
// means "create", a film means "edit" — same fields, forking would drift):
// title, canvas aspect (PillGroup), and a default style the composer pre-selects
// for new shots. On create it navigates straight into the new film's editor.
import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import type { AspectRatio, Film } from '@opencreate/contracts'
import { aspectRatioSchema } from '@opencreate/contracts'
import { Button, Input, Modal, PillGroup, Select } from 'shared/ui'
import { useCreateFilm, useUpdateFilm } from '../model/filmsApi'
import { styleOptions } from '../model/presetOptions'
import type { StyleChoice } from '../model/presetOptions'

export type FilmSettingsModalProps = {
  // null → create mode; a film → edit mode (prefilled)
  film: Film | null
  isOpen: boolean
  onClose: () => void
}

const ASPECT_OPTIONS = aspectRatioSchema.options.map((value) => ({ value, label: value }))

export function FilmSettingsModal({ film, isOpen, onClose }: FilmSettingsModalProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const createFilm = useCreateFilm()
  const updateFilm = useUpdateFilm()

  const [title, setTitle] = useState(film?.title ?? '')
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(film?.aspectRatio ?? '16:9')
  // '' = no default style; styleOptions(t) carry the enum values
  const [styleId, setStyleId] = useState<StyleChoice>(film?.defaultStyleId ?? '')

  const isEdit = film !== null
  const isBusy = createFilm.isPending || updateFilm.isPending
  const isError = createFilm.isError || updateFilm.isError
  const canSubmit = title.trim().length > 0 && !isBusy

  const handleSubmit = () => {
    if (title.trim().length === 0) return
    // '' widens the picker; the wire wants null for "no default"
    const defaultStyleId = styleId === '' ? null : styleId
    if (isEdit) {
      updateFilm.mutate(
        { filmId: film.id, input: { title: title.trim(), aspectRatio, defaultStyleId } },
        { onSuccess: onClose },
      )
    } else {
      createFilm.mutate(
        { title: title.trim(), aspectRatio, defaultStyleId },
        {
          // Land the user in the editor of the film they just made
          onSuccess: (created) =>
            void navigate({ to: '/cinema/$filmId', params: { filmId: created.id } }),
        },
      )
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? t('cinema.settings.editTitle') : t('cinema.settings.createTitle')}
    >
      <div className="flex flex-col gap-4">
        <Input
          label={t('cinema.settings.title')}
          value={title}
          placeholder={t('cinema.settings.titlePlaceholder')}
          onChange={(event) => setTitle(event.target.value)}
        />

        <PillGroup
          label={t('cinema.settings.aspect')}
          options={ASPECT_OPTIONS}
          value={aspectRatio}
          onChange={setAspectRatio}
        />

        <Select<StyleChoice>
          label={t('cinema.settings.style')}
          options={[{ value: '', label: t('cinema.settings.styleNone') }, ...styleOptions(t)]}
          value={styleId}
          onChange={setStyleId}
        />

        {isError ? (
          <span role="alert" className="text-sm text-glow-red">
            {t('errors.actionFailed')}
          </span>
        ) : null}

        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} isLoading={isBusy} disabled={!canSubmit}>
            {isEdit ? t('common.done') : t('cinema.settings.create')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
