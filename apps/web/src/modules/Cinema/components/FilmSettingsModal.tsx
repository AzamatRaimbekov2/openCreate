// apps/web/src/modules/Cinema/components/FilmSettingsModal.tsx
// Create-or-edit a film in one modal — but the two modes DELIBERATELY DIVERGE
// (owner request 2026-07-31), which is the one place this file departs from the
// Entities editor pattern it otherwise follows.
//
// CREATE asks two things: a name, and optionally a cover. Nothing else, because
// nothing else can be answered well yet — the aspect is implied by the shots that
// do not exist, and the default style is a per-shot decision the user has not
// reached. Both used to be posed here and both were answered by shrugging at a
// default. The server owns the aspect default now (contracts film.ts), so create
// does not send one at all: two opinions about the same field is how they drift.
//
// EDIT keeps aspect and default style untouched — by then the film is real and
// the questions are informed. That is the whole justification for the fork.
//
// The cover rides the CREATE body as bytes rather than a follow-up upload, so
// "name it and pick a picture" is ONE request that cannot half-succeed. Until
// submit the pick is LOCAL state: nothing is uploaded while the user is deciding,
// and a 400 means no film at all rather than a film with a broken cover.
import { useState } from 'react'
import type { ChangeEvent, ClipboardEvent, DragEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import type { AspectRatio, CreateFilmInput, Film, Style } from '@opencreate/contracts'
import { aspectRatioSchema } from '@opencreate/contracts'
import { readImageFile } from 'shared/libs/readImageFile'
import type { ReadImageError } from 'shared/libs/readImageFile'
import { Button, Card, Input, Modal, PillGroup, Select } from 'shared/ui'
import { useCreateFilm, useUpdateFilm } from '../model/filmsApi'
import { styleOptions } from '../model/presetOptions'
import type { StyleChoice } from '../model/presetOptions'

export type FilmSettingsModalProps = {
  // null → create mode; a film → edit mode (prefilled)
  film: Film | null
  // The style registry (builtin + the caller's own), injected from the route: a
  // film's DEFAULT style is the one every new shot inherits, so a style the user
  // wrote has to be offerable here. Empty while in flight — styleOptions then
  // falls back to the bundled builtins rather than emptying the picker.
  // Explicit `| undefined` because tsconfig has exactOptionalPropertyTypes and
  // the callers pass a value that may itself be undefined.
  styles?: readonly Style[] | undefined
  isOpen: boolean
  onClose: () => void
}

const ASPECT_OPTIONS = aspectRatioSchema.options.map((value) => ({ value, label: value }))

export function FilmSettingsModal({
  film,
  styles = [],
  isOpen,
  onClose,
}: FilmSettingsModalProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const createFilm = useCreateFilm()
  const updateFilm = useUpdateFilm()

  const [title, setTitle] = useState(film?.title ?? '')
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(film?.aspectRatio ?? '16:9')
  // '' = no default style; styleOptions(t) carry the enum values
  const [styleId, setStyleId] = useState<StyleChoice>(film?.defaultStyleId ?? '')
  // The cover, held locally until submit in BOTH modes — nothing is uploaded
  // while the user is still deciding, and changing their mind costs nothing.
  //
  // THREE STATES, and the third one is why this is a union rather than a
  // `string | null`. On the wire `coverDataUri` means: bytes → replace, null →
  // REMOVE, absent → leave alone (contracts film.ts). Collapsing "untouched"
  // into null is the mistake that matters: every PATCH that only renames a film
  // would silently wipe its picture. So the draft names all three, and
  // `coverPatch()` below is the single place that maps them onto the wire.
  //   untouched → the key is omitted
  //   replaced  → the data URI
  //   cleared   → an explicit null
  // In CREATE mode only 'untouched' and 'replaced' occur (there is nothing to
  // clear yet), and 'untouched' means "no cover", which is why create omits the
  // key too rather than sending null.
  const [cover, setCover] = useState<
    { kind: 'untouched' } | { kind: 'replaced'; dataUri: string } | { kind: 'cleared' }
  >({ kind: 'untouched' })
  const [coverErrorKey, setCoverErrorKey] = useState<ReadImageError | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const isEdit = film !== null
  const isBusy = createFilm.isPending || updateFilm.isPending
  const isError = createFilm.isError || updateFilm.isError
  const canSubmit = title.trim().length > 0 && !isBusy

  // Every gesture through the ONE shared gate, so the type/size rules cannot fork
  // between click, drop and paste or drift from the wire's own cap.
  const acceptFile = async (file: File) => {
    const result = await readImageFile(file)
    if (!result.ok) {
      setCoverErrorKey(result.errorKey)
      return
    }
    setCoverErrorKey(null)
    setCover({ kind: 'replaced', dataUri: result.dataUri })
  }

  // The draft's three states → the wire's three meanings. The ONLY place that
  // mapping exists, because getting it wrong in a second place is how the
  // rename-wipes-the-cover bug would come back.
  const coverPatch = (): { coverDataUri?: string | null } => {
    if (cover.kind === 'replaced') return { coverDataUri: cover.dataUri }
    if (cover.kind === 'cleared') return { coverDataUri: null }
    return {}
  }

  // What the block should show right now: the freshly picked bytes, else the
  // film's stored cover, else nothing (an empty dropzone).
  const shownCover =
    cover.kind === 'replaced' ? cover.dataUri : cover.kind === 'cleared' ? null : (film?.coverUrl ?? null)

  const handleCoverInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Reset first: picking the SAME file twice must still fire a change event
    event.target.value = ''
    if (file) void acceptFile(file)
  }

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const file = event.clipboardData.files[0]
    // No files on the clipboard = a text paste; leave it alone
    if (!file) return
    event.preventDefault()
    void acceptFile(file)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    const file = event.dataTransfer.files[0]
    if (file) void acceptFile(file)
  }

  const handleSubmit = () => {
    if (title.trim().length === 0) return
    if (isEdit) {
      // '' widens the picker; the wire wants null for "no default".
      // `coverPatch()` contributes the cover key ONLY if the user touched it —
      // see the draft's three states above.
      updateFilm.mutate(
        {
          filmId: film.id,
          input: {
            title: title.trim(),
            aspectRatio,
            defaultStyleId: styleId === '' ? null : styleId,
            ...coverPatch(),
          },
        },
        { onSuccess: onClose },
      )
      return
    }
    // CREATE sends only what was actually asked for. No aspectRatio (the server
    // defaults it) and no defaultStyleId (create no longer poses the question),
    // and `coverDataUri` only when there is one — an explicit undefined would
    // still serialise the key away, but building the object honestly is what
    // keeps the request readable in a network log.
    const input: CreateFilmInput = {
      title: title.trim(),
      // Same mapping as edit, minus the 'cleared' case that cannot happen here:
      // create omits the key when no picture was picked rather than sending null.
      ...(cover.kind === 'replaced' ? { coverDataUri: cover.dataUri } : {}),
    }
    createFilm.mutate(input, {
      // Land the user in the editor of the film they just made
      onSuccess: (created) =>
        void navigate({ to: '/cinema/$filmId', params: { filmId: created.id } }),
    })
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

        {/* EDIT ONLY. Both questions need a film that exists: the aspect is
            implied by the shots on the timeline, and the default style is the one
            new shots inherit — neither is answerable at the moment of naming. */}
        {isEdit ? (
          <>
            <PillGroup
              label={t('cinema.settings.aspect')}
              options={ASPECT_OPTIONS}
              value={aspectRatio}
              onChange={setAspectRatio}
            />

            <Select<StyleChoice>
              label={t('cinema.settings.style')}
              options={[
                { value: '', label: t('cinema.settings.styleNone') },
                ...styleOptions(styles, t),
              ]}
              value={styleId}
              onChange={setStyleId}
            />
          </>
        ) : null}

        {/* THE COVER — in BOTH modes since the owner follow-up (2026-08-02).
            Create picks the first one; edit replaces or removes it. The markup is
            shared deliberately: the affordance is identical and the only thing
            that differs is what the draft's three states MEAN on the wire, which
            is `coverPatch()`'s job, not this block's. A focusable region so a
            paste lands in scope and a drop has a target; the pick stays local
            until submit in both modes. */}
        {
          <div
            role="group"
            aria-label={t('cinema.settings.cover.label')}
            tabIndex={0}
            onPaste={handlePaste}
            onDrop={handleDrop}
            onDragOver={(event) => {
              // preventDefault is what makes this a valid drop target
              event.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            className={`flex flex-col gap-1.5 rounded-xl outline-none transition-shadow duration-200 ${
              isDragging ? 'ring-2 ring-portal' : 'focus-visible:ring-2 focus-visible:ring-portal'
            }`}
          >
            <span className="text-xs text-mist-dim">{t('cinema.settings.cover.label')}</span>

            {shownCover === null ? (
              // A real <label> wrapping a sr-only input (the CreateAssetModal
              // pattern): the input carries the accessible name, the dashed plate
              // is the click target.
              <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-white/15 px-4 py-6 text-center text-sm text-mist-dim transition-colors duration-200 hover:border-white/30 hover:bg-ridge/30">
                {t('cinema.settings.cover.hint')}
                <input
                  type="file"
                  accept="image/*"
                  aria-label={t('cinema.settings.cover.add')}
                  className="sr-only"
                  onChange={handleCoverInput}
                />
              </label>
            ) : (
              <div className="relative">
                {/* The thumb is ITSELF the replace target — a label around the
                    plate, so clicking the picture picks a new one. The ✕ is a
                    SIBLING of that label, not a child: a button inside a label
                    triggers the label, so removing would open the file picker. */}
                <label className="block cursor-pointer">
                  {/* The cover is CONTENT — a recessed well plate, never frosted.
                      object-contain so the picture is judged whole here; the
                      library card crops it to the canvas shape instead. */}
                  <Card surface="well" padding="none" className="overflow-hidden">
                    <img
                      src={shownCover}
                      alt={t('cinema.settings.cover.label')}
                      className="max-h-40 w-full object-contain"
                    />
                  </Card>
                  <input
                    type="file"
                    accept="image/*"
                    aria-label={t('cinema.settings.cover.replace')}
                    className="sr-only"
                    onChange={handleCoverInput}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setCover({ kind: 'cleared' })}
                  aria-label={t('cinema.settings.cover.remove')}
                  className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border border-white/10 bg-specimen-red/80 text-[10px] leading-none text-lumen-red transition-colors duration-200 hover:bg-specimen-red focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
                >
                  ✕
                </button>
              </div>
            )}

            {coverErrorKey ? (
              <span role="alert" className="text-xs text-glow-red">
                {t(coverErrorKey)}
              </span>
            ) : null}
          </div>
        }

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
