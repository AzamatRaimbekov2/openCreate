// apps/web/src/modules/Generator/components/ImageDrop.tsx
// i2v reference-image upload: file picker + drag-and-drop, client-side
// validation (image/* type, ≤10MB — the contracts inputImage cap is 14MB of
// base64, i.e. ~10MB of file), FileReader → data URI into the store. The API
// only ever receives data URIs, never user URLs (SSRF guard in contracts).
import { useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from 'shared/ui'

export type ImageDropProps = {
  // Current data URI from the store; null = no image chosen
  value: string | null
  // Store action (generatorStore.setInputImage); null clears
  onChange: (dataUri: string | null) => void
}

// 10MB file cap — base64 inflates ~4/3, keeping us under the wire schema's 14MB
const MAX_FILE_BYTES = 10 * 1024 * 1024

export function ImageDrop({ value, onChange }: ImageDropProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  // Store the error as an i18n KEY so a language switch re-localizes it
  const [errorKey, setErrorKey] = useState<string | null>(null)

  const readFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorKey('generator.image.errors.type')
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setErrorKey('generator.image.errors.size')
      return
    }
    setErrorKey(null)
    const reader = new FileReader()
    reader.onload = () => {
      // readAsDataURL always yields a string; guard keeps the type airtight
      if (typeof reader.result === 'string') onChange(reader.result)
    }
    reader.readAsDataURL(file)
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
          <img
            src={value}
            alt={t('generator.image.previewAlt')}
            className="size-16 rounded-xl border border-ink/10 object-cover"
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
            className="rounded-xl border border-dashed border-ink/15 bg-white px-4 py-6 text-sm text-ink-soft transition-opacity duration-150 hover:bg-sand focus-visible:ring-2 focus-visible:ring-vermillion focus-visible:outline-none"
          >
            {t('generator.image.hint')}
          </button>
        </>
      )}
      {errorKey ? (
        <span role="alert" className="text-sm text-danger">
          {t(errorKey)}
        </span>
      ) : null}
    </div>
  )
}
