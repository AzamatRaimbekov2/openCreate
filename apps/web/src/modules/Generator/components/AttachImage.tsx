// apps/web/src/modules/Generator/components/AttachImage.tsx
// The composer's paperclip: a compact attach control that collapses into a
// thumbnail chip once an image is chosen.
//
// WHY NOT ImageDrop: the sheet's dropzone is a 6rem-tall dashed panel — it
// owns a row. A docked chat bar has no rows to spare, and an empty dropzone
// sitting under every prompt would shout at users who mostly type. So the
// empty state here is a single 40px button, and the filled state is a chip
// with the image and a remove ✕ — the same silhouette Higgsfield uses.
//
// Validation is NOT reimplemented: readImageFile is the one gate (see its
// header for why that matters on the wire). It now lives in shared/ so Cinema's
// shot references share the exact same caps without a cross-module import.
import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { readImageFile } from 'shared/libs/readImageFile'

export type AttachImageProps = {
  // Current data URI from the store; null = no image chosen
  value: string | null
  // Store action (generatorStore.setInputImage); null clears
  onChange: (dataUri: string | null) => void
}

export function AttachImage({ value, onChange }: AttachImageProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  // Stored as an i18n KEY so a language switch re-localizes a visible error
  const [errorKey, setErrorKey] = useState<string | null>(null)

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Reset first so re-picking the same file fires change again
    event.target.value = ''
    if (!file) return
    void readImageFile(file).then((result) => {
      if (result.ok) {
        setErrorKey(null)
        onChange(result.dataUri)
      } else {
        setErrorKey(result.errorKey)
      }
    })
  }

  if (value) {
    return (
      // No visible caption: this control lives INSIDE the composer's input row,
      // where a stacked label would push the row taller than the send button.
      // The image's alt text and the remove button's aria-label carry it for AT.
      <div className="shrink-0">
        {/* Chip: the reference image on the abyss well (the recessed step
            reserved for user media), with the remove ✕ pinned to its corner */}
        <div className="relative w-fit">
          <img
            src={value}
            alt={t('generator.image.previewAlt')}
            className="size-9 rounded-full border border-white/10 bg-abyss object-cover"
          />
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={t('generator.image.remove')}
            // Red = destructive, per the triad. Small target, so it overhangs
            // the thumbnail rather than shrinking below the 24px hit floor.
            className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border border-white/10 bg-specimen-red/80 text-[10px] leading-none text-lumen-red transition-colors duration-200 hover:bg-specimen-red focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
          >
            ✕
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative shrink-0">
      {/* Hidden real input keeps the native picker + testability (by label) */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        aria-label={t('generator.image.label')}
        className="sr-only"
        onChange={handleChange}
      />
      {/* Round + button matching the capsule's radius language. The visible
          caption is gone (see above), so the button carries the name itself. */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        aria-label={t('generator.image.label')}
        className="flex size-9 items-center justify-center rounded-full border border-white/15 text-mist-dim transition-colors duration-200 hover:border-white/30 hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
      >
        <span aria-hidden="true" className="text-lg leading-none">
          +
        </span>
      </button>
      {errorKey ? (
        // glow-red = the triad's failure color (validation is a failure status).
        // Absolutely positioned so a validation error never resizes the capsule.
        <span
          role="alert"
          className="absolute bottom-full left-0 mb-1 whitespace-nowrap text-xs text-glow-red"
        >
          {t(errorKey)}
        </span>
      ) : null}
    </div>
  )
}
