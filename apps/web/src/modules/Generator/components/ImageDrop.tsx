// apps/web/src/modules/Generator/components/ImageDrop.tsx
// i2v reference-image upload: file picker + drag-and-drop, client-side
// validation (image/* type, ≤10MB — the contracts inputImage cap is 14MB of
// base64, i.e. ~10MB of file), FileReader → data URI into the store. The API
// only ever receives data URIs, never user URLs (SSRF guard in contracts).
import { useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from 'shared/ui'
import { readImageFile } from 'shared/libs/readImageFile'

export type ImageDropProps = {
  // Current data URI from the store; null = no image chosen
  value: string | null
  // Store action (generatorStore.setInputImage); null clears
  onChange: (dataUri: string | null) => void
}

export function ImageDrop({ value, onChange }: ImageDropProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  // Store the error as an i18n KEY so a language switch re-localizes it
  const [errorKey, setErrorKey] = useState<string | null>(null)

  // Validation + data-URI read live in shared/libs/readImageFile — the composer's
  // AttachImage shares them, so the 10MB cap can never drift between the two
  const readFile = (file: File) => {
    void readImageFile(file).then((result) => {
      if (result.ok) {
        setErrorKey(null)
        onChange(result.dataUri)
      } else {
        setErrorKey(result.errorKey)
      }
    })
  }

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) readFile(file)
    // Reset so re-picking the same file fires change again
    event.target.value = ''
  }

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault()
    const file = event.dataTransfer.files[0]
    if (file) readFile(file)
  }

  return (
    <div className="flex flex-col gap-2">
      {value ? (
        <div className="flex items-center gap-3">
          {/* The reference image sits on the abyss well — the recessed surface
              step reserved for user media (design.md v3 §2) */}
          <img
            src={value}
            alt={t('generator.image.previewAlt')}
            className="size-16 rounded-lg border border-white/10 bg-abyss object-cover"
          />
          <Button variant="ghost" onClick={() => onChange(null)}>
            {t('generator.image.remove')}
          </Button>
        </div>
      ) : (
        <>
          {/* Hidden real input keeps native picker + testability (query by label) */}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            aria-label={t('generator.image.label')}
            className="sr-only"
            onChange={handleInputChange}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            // Allow dropping: default dragover behavior blocks the drop event
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
            // Terminal dropzone: a dashed white/15 hairline directly on the
            // void; hover brightens the line + steps toward ridge — the
            // "hover must be felt" gesture stays shadow-free
            className="rounded-lg border border-dashed border-white/15 bg-transparent px-4 py-6 text-sm text-mist-dim transition-colors duration-200 hover:border-white/30 hover:bg-ridge/30 focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
          >
            {t('generator.image.hint')}
          </button>
        </>
      )}
      {errorKey ? (
        // glow-red = the triad's failure color (validation is a failure status)
        <span role="alert" className="text-sm text-glow-red">
          {t(errorKey)}
        </span>
      ) : null}
    </div>
  )
}
