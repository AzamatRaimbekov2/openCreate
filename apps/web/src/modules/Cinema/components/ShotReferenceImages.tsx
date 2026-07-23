// apps/web/src/modules/Cinema/components/ShotReferenceImages.tsx
// Attach ANY image to a shot as a generation reference — the fix for the owner's
// complaint that "attach" only offered character tagging and could not take a
// drag-drop or a pasted screenshot. It sits ALONGSIDE ShotCastField in the cast
// drawer: that control TAGS a known character (the fox is the same fox across
// shots); this one attaches an arbitrary "make it look like these" picture.
//
// THREE inputs, ONE gate: click-to-upload, drag-and-drop onto this area, and
// paste (Cmd/Ctrl+V of a screenshot) all route the file through the shared
// readImageFile gate (shared/libs — one type/size check for the whole app) and
// then POST the data URI. The just-attached thumbnail renders from the server
// /media path off the refetched shot (the add hook invalidates the film detail),
// never the client data URI — the path is the honest source of truth and is what
// the model will actually receive at generate time.
//
// THE SHARED BUDGET OF 5: entity tags + attached images cap at
// MAX_SHOT_REFERENCE_IMAGES together (Wan 2.7 r2v's own ceiling). We disable the
// add affordance at the cap; the API enforces it too and a 400 becomes localized
// copy — never raw server text (design.md §9).
//
// PASTE SCOPING: the paste handler lives on THIS region (React onPaste), so it
// only fires when the reference area (or a child) is focused — a Cmd+V into the
// prompt textarea or anywhere else on the page is never hijacked. Being element-
// scoped, there is NO document listener to leak.
//
// HONEST CAPABILITY COPY: reference images only affect the output on a model with
// referenceMode (among video, only Wan 2.7 "Cinema"). If the shot's model has
// none we do NOT block attaching — the images persist and pay off the moment the
// user switches — we just say so, calmly, instead of the character-centric
// "cannot hold a character" that confused people.
import { useRef, useState } from 'react'
import type { ChangeEvent, ClipboardEvent, DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { MAX_SHOT_REFERENCE_IMAGES } from '@opencreate/contracts'
import type { ShotReferenceImage } from '@opencreate/contracts'
import { ApiClientError } from 'shared/libs/apiClient'
import { errorCodeMessageKey } from 'shared/libs/errorCopy'
import { readImageFile } from 'shared/libs/readImageFile'
import { Card, Skeleton } from 'shared/ui'
import { useAddShotReference, useDeleteShotReference } from '../model/shotReferencesApi'

export type ShotReferenceImagesProps = {
  filmId: string
  // The shot these images hang on
  shotId: string
  // Already-attached images (server /media paths), from the refetched shot. Never
  // null on the wire, so no null-check before mapping.
  references: ShotReferenceImage[]
  // LIVE tagged-character count — shares the budget of 5 with the images, so the
  // "N / 5" and the cap reflect what ShotCastField shows in the same drawer.
  entityRefCount: number
  // Whether the selected model actually consumes references (has referenceMode).
  // false → we still allow attaching, but show the calm switch-to-Wan notice.
  modelSupportsReferences: boolean
}

export function ShotReferenceImages({
  filmId,
  shotId,
  references,
  entityRefCount,
  modelSupportsReferences,
}: ShotReferenceImagesProps) {
  const { t } = useTranslation()
  const add = useAddShotReference()
  const del = useDeleteShotReference()
  const inputRef = useRef<HTMLInputElement>(null)
  // Client-side reject (type/size) from the shared gate, held as an i18n KEY so a
  // language switch re-localizes a visible error. Distinct from a server 400.
  const [localErrorKey, setLocalErrorKey] = useState<string | null>(null)
  // Drag-over highlight only — never a layout shift, just a portal ring
  const [isDragging, setIsDragging] = useState(false)

  const used = entityRefCount + references.length
  const atCap = used >= MAX_SHOT_REFERENCE_IMAGES

  // The one path every input funnels through: validate + read, then POST. A
  // rejected file sets the notice and fires NO request (the API never sees it).
  const acceptFile = async (file: File) => {
    const result = await readImageFile(file)
    if (!result.ok) {
      setLocalErrorKey(result.errorKey)
      return
    }
    setLocalErrorKey(null)
    add.mutate({ filmId, shotId, dataUri: result.dataUri })
  }

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Reset first so re-picking the same file fires change again
    event.target.value = ''
    if (file) void acceptFile(file)
  }

  // Paste is scoped to this focused region (see header). A text paste carries no
  // FILE, so it falls through untouched; a pasted file is handed to the ONE gate
  // (readImageFile), which decides image-vs-not — never a second type check here.
  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    if (atCap || add.isPending) return
    const file = event.clipboardData?.files?.[0]
    if (!file) return
    event.preventDefault()
    void acceptFile(file)
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    // preventDefault is what makes this element a valid drop target
    event.preventDefault()
    if (!atCap) setIsDragging(true)
  }

  const handleDragLeave = () => setIsDragging(false)

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    if (atCap || add.isPending) return
    // The first dropped file goes straight to the ONE gate — a non-image is
    // rejected THERE (with a localized notice), not silently swallowed here.
    const file = event.dataTransfer.files[0]
    if (file) void acceptFile(file)
  }

  // Newest failure across the two mutations, mapped to a localized key. A client
  // reject (localErrorKey) wins because it is the more recent, more specific act.
  const mutationError = add.error ?? del.error
  const mutationErrorCode =
    mutationError instanceof ApiClientError
      ? mutationError.code
      : mutationError
        ? 'internal_error'
        : null
  const noticeKey =
    localErrorKey ?? (mutationErrorCode ? errorCodeMessageKey(mutationErrorCode) : null)

  return (
    // A focusable region so a paste lands in scope (tabIndex) and a drop has a
    // target. role=group + aria-label name it for AT and for the tests.
    <div
      role="group"
      aria-label={t('cinema.shotRef.title')}
      tabIndex={0}
      onPaste={handlePaste}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`flex flex-col gap-2 rounded-xl outline-none transition-shadow duration-200 ${
        isDragging ? 'ring-2 ring-portal' : 'focus-visible:ring-2 focus-visible:ring-portal'
      }`}
    >
      {/* The shared budget, spoken as "N / 5" (the section title is the drawer's
          own legend). Amber when full so the number reads as the reason the add
          tile is gone, not a glitch. */}
      <div className="flex items-center justify-end">
        <span className={`text-xs ${atCap ? 'text-lumen-amber' : 'text-mist-dim'}`}>
          {used} / {MAX_SHOT_REFERENCE_IMAGES}
        </span>
      </div>

      {/* Honest capability copy — a calm note, NOT an error and NOT a block. */}
      {!modelSupportsReferences ? (
        <p className="text-xs text-mist-dim">{t('cinema.shotRef.modelHint')}</p>
      ) : null}

      {/* The thumbnail grid + the add tile. Media sits in a `well` Card (the
          recessed plate reserved for user media, design.md) — never frosted. */}
      <div className="flex flex-wrap gap-2">
        {references.map((ref) => (
          <div key={ref.id} className="relative">
            <Card surface="well" padding="none" className="size-16 overflow-hidden">
              <img
                src={ref.path}
                alt={t('cinema.shotRef.previewAlt')}
                className="size-full object-cover"
              />
            </Card>
            <button
              type="button"
              onClick={() => del.mutate({ filmId, shotId, refId: ref.id })}
              aria-label={t('cinema.shotRef.remove')}
              // Red = destructive (the triad). Overhangs the plate so it never
              // shrinks below the hit floor or covers the image.
              className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border border-white/10 bg-specimen-red/80 text-[10px] leading-none text-lumen-red transition-colors duration-200 hover:bg-specimen-red focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
            >
              ✕
            </button>
          </div>
        ))}

        {/* Loading: the in-flight upload as a pulsing plate at the well's radius,
            replaced by the real /media thumbnail when the refetch lands. */}
        {add.isPending ? <Skeleton className="size-16 rounded-2xl" /> : null}

        {/* Add tile — a real <label> wrapping a sr-only input (CreateAssetModal's
            pattern): the input carries the accessible name, the label is the
            click target and the picker trigger. Hidden at the cap. */}
        {!atCap ? (
          <label className="grid size-16 cursor-pointer place-items-center rounded-2xl border border-dashed border-white/15 text-mist-dim transition-colors duration-200 hover:border-white/30 hover:bg-white/5 focus-within:ring-2 focus-within:ring-portal">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              aria-label={t('cinema.shotRef.add')}
              className="sr-only"
              onChange={handleInputChange}
            />
            <span aria-hidden="true" className="text-lg leading-none">
              +
            </span>
          </label>
        ) : null}
      </div>

      {/* Empty: no images yet and room to add — the discoverability hint that
          names all three gestures (click / drop / paste). */}
      {references.length === 0 && !atCap ? (
        <p className="text-xs text-mist-dim/70">{t('cinema.shotRef.hint')}</p>
      ) : null}

      {/* Error: a client reject or a server 400, always localized, never raw. */}
      {noticeKey ? (
        <p role="alert" className="text-xs text-glow-red">
          {t(noticeKey)}
        </p>
      ) : null}
    </div>
  )
}
