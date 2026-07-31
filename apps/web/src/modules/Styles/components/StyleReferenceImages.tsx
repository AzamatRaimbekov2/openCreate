// apps/web/src/modules/Styles/components/StyleReferenceImages.tsx
// The reference half of the style PACKAGE (ADR style-studio A1/A4): up to three
// images that ride along with the style's prompt fragments. A near-mirror of
// Cinema's ShotReferenceImages, deliberately — the two solve the same problem
// (attach a picture to a thing) and users should not have to learn it twice.
//
// THREE GESTURES, ONE GATE. Click, drop and paste all funnel through
// shared/libs/readImageFile, so the type/size rules cannot fork between them or
// drift from the wire's own cap. A reject is a localized notice and NO request.
//
// THE COPY IS HONEST ABOUT AMBIENCE. The server applies these images through the
// same reference channel as entity photos and shot references, WITH the model's
// gates: on a model that takes no references they are dropped silently, and when
// the budget is full the STYLE's images are trimmed first (ADR A2/A3 — entity
// tags outrank a style, because a style is ambient). So the hint says "where the
// model can use them" rather than promising they always arrive. Fragments always
// apply; only the pictures are conditional.
import { useState } from 'react'
import type { ChangeEvent, ClipboardEvent, DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { StyleReferenceImage } from '@opencreate/contracts'
import { STYLE_MAX_REFERENCES } from '@opencreate/contracts'
import { ApiClientError } from 'shared/libs/apiClient'
import { errorCodeMessageKey } from 'shared/libs/errorCopy'
import { readImageFile } from 'shared/libs/readImageFile'
import type { ReadImageError } from 'shared/libs/readImageFile'
import { Card, Skeleton } from 'shared/ui'
import { useAddStyleReference, useDeleteStyleReference } from '../model/api'

export type StyleReferenceImagesProps = {
  // The style these images hang on. Edit mode only — an unsaved style has no id
  // to attach to (the StyleEditor renders the "create it first" line instead).
  styleId: string
  // The live strip, straight off the cached Style: both mutations answer with
  // the whole updated row, so this prop is always the server's own truth.
  references: StyleReferenceImage[]
}

export function StyleReferenceImages({ styleId, references }: StyleReferenceImagesProps) {
  const { t } = useTranslation()
  const add = useAddStyleReference()
  const del = useDeleteStyleReference()
  const [localErrorKey, setLocalErrorKey] = useState<ReadImageError | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const atCap = references.length >= STYLE_MAX_REFERENCES

  // The ONE path every gesture takes. Refusals happen HERE, before any request,
  // so a wrong file costs a round-trip to nobody.
  const acceptFile = async (file: File) => {
    if (atCap || add.isPending) return
    const result = await readImageFile(file)
    if (!result.ok) {
      setLocalErrorKey(result.errorKey)
      return
    }
    setLocalErrorKey(null)
    add.mutate({ id: styleId, dataUri: result.dataUri })
  }

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Reset first: picking the SAME file twice must still fire a change event
    event.target.value = ''
    if (file) void acceptFile(file)
  }

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const file = event.clipboardData.files[0]
    // No files on the clipboard = a text paste; leave it alone entirely
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
    const file = event.dataTransfer.files[0]
    if (file) void acceptFile(file)
  }

  // Newest failure across the two mutations, mapped to a localized key. A client
  // reject wins: it is the more recent and more specific act.
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
    // Focusable region so a paste lands in scope and a drop has a target;
    // role=group + aria-label name it for assistive tech (and for the tests).
    <div
      role="group"
      aria-label={t('styles.references.title')}
      tabIndex={0}
      onPaste={handlePaste}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`flex flex-col gap-2 rounded-xl outline-none transition-shadow duration-200 ${
        isDragging ? 'ring-2 ring-portal' : 'focus-visible:ring-2 focus-visible:ring-portal'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-mist-dim">{t('styles.references.title')}</span>
        {/* Amber at the cap so the number reads as the REASON the add tile is
            gone, rather than as a glitch. */}
        <span className={`text-xs ${atCap ? 'text-lumen-amber' : 'text-mist-dim'}`}>
          {references.length} / {STYLE_MAX_REFERENCES}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {references.map((ref) => (
          <div key={ref.id} className="relative">
            {/* Media sits in a recessed `well` Card — the plate reserved for
                user media (design.md), never frosted glass. */}
            <Card surface="well" padding="none" className="size-16 overflow-hidden">
              <img
                src={ref.url}
                alt={t('styles.references.previewAlt')}
                className="size-full object-cover"
              />
            </Card>
            <button
              type="button"
              onClick={() => del.mutate({ id: styleId, refId: ref.id })}
              aria-label={t('styles.references.remove')}
              // Red = destructive (the triad). Overhangs the plate so it never
              // shrinks below the hit floor or covers the picture.
              className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border border-white/10 bg-specimen-red/80 text-[10px] leading-none text-lumen-red transition-colors duration-200 hover:bg-specimen-red focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
            >
              ✕
            </button>
          </div>
        ))}

        {/* The in-flight upload as a pulsing plate at the well's radius, swapped
            for the real /media thumbnail when the answer lands. */}
        {add.isPending ? <Skeleton className="size-16 rounded-2xl" /> : null}

        {/* Add tile — a real <label> wrapping a sr-only input (the
            CreateAssetModal pattern): the input carries the accessible name, the
            label is the click target.
            At the cap it is DISABLED, not removed, and the amber `N / 3` beside
            it plus the "all 3 used" line say WHY — the Assets3D PartsStage law
            ("a disabled control with no reason reads as a bug"). Keeping the tile
            on screen keeps the ceiling legible; a vanished control just looks
            like the feature moved. The gesture handlers refuse independently, so
            a drop or paste cannot slip past a merely-visual disable. */}
        <label
          className={`grid size-16 place-items-center rounded-2xl border border-dashed transition-colors duration-200 ${
            atCap
              ? 'cursor-not-allowed border-white/10 text-mist-dim/40'
              : 'cursor-pointer border-white/15 text-mist-dim hover:border-white/30 hover:bg-white/5 focus-within:ring-2 focus-within:ring-portal'
          }`}
        >
          <input
            type="file"
            accept="image/*"
            aria-label={t('styles.references.add')}
            disabled={atCap}
            className="sr-only"
            onChange={handleInputChange}
          />
          <span aria-hidden="true" className="text-lg leading-none">
            +
          </span>
        </label>
      </div>

      {/* Discoverability: names all three gestures, only while there is room. */}
      {references.length === 0 && !atCap ? (
        <p className="text-[11px] text-mist-dim/70">
          {t('styles.references.hint', { count: STYLE_MAX_REFERENCES })}
        </p>
      ) : null}

      {/* The reason the tile above is dead. Amber, not red: nothing failed — the
          package is simply full, and removing one re-opens it. */}
      {atCap ? (
        <p className="text-[11px] text-lumen-amber">
          {t('styles.references.full', { count: STYLE_MAX_REFERENCES })}
        </p>
      ) : null}

      {/* The ambience caveat — see the file header. Always shown, because the
          promise it withholds is the one a user would otherwise assume. */}
      <p className="text-[11px] text-mist-dim/70">{t('styles.references.ambient')}</p>

      {/* A client reject or a server refusal, always localized, never raw. */}
      {noticeKey ? (
        <p role="alert" className="text-xs text-glow-red">
          {t(noticeKey)}
        </p>
      ) : null}
    </div>
  )
}
