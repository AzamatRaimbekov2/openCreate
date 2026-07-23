// apps/web/src/modules/Assets3D/components/CreateAssetModal.tsx
// Create a modular asset: a title and the ONE concept image every part is later
// extracted from. Creating is FREE — the money starts at extraction — and the
// caption says so, because a wizard that opens with an upload box looks like it
// is about to charge for one.
//
// Two client-side gates exist for reasons the server also enforces, but which a
// user should learn HERE rather than from a 400:
//   · the image must become a base64 DATA URI. The API never accepts a user URL
//     (that would be an SSRF hole), so the file is read locally and only its
//     encoding travels.
//   · svg is REFUSED. The contract's `dataUriImage` regex admits png/jpeg/webp
//     only, because an svg is a script container (stored XSS) — not a picture.
//
// The 14MB base64 cap in the contract translates to ~10MB of file, the same
// arithmetic the Generator's reference-image drop does; we cannot import its
// helper (no cross-module imports), so the rule is restated with its reason.
import { useState } from 'react'
import type { ChangeEvent } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { ApiClientError } from 'shared/libs/apiClient'
import { errorCodeMessageKey } from 'shared/libs/errorCopy'
import { Button, Card, Input, Modal } from 'shared/ui'
import { useCreateAsset } from '../model/asset3dApi'

// ~10MB of file → under the contract's 14MB base64 ceiling (base64 inflates 4/3)
const MAX_FILE_BYTES = 10 * 1024 * 1024
// The SAME shape the contract's dataUriImage enforces, restated so a bad encode
// can never reach the wire. `;base64,` is part of the anchor on purpose: a bare
// startsWith('data:image/') check has a prefix-boundary hole.
const DATA_URI_RE = /^data:image\/(png|jpe?g|webp);base64,/

// Zod is the single source of truth for this form. Messages are i18n KEYS,
// translated at the render site so a language switch re-localizes an error that
// is already on screen (the AuthForm precedent). Constraints mirror
// createAsset3dInputSchema — the contract is not imported directly because its
// messages are English prose, and this form must speak the user's language.
const createAssetSchema = z.object({
  title: z.string().trim().min(1, 'assets3d.create.errors.title').max(120),
  conceptImage: z
    .string()
    .min(1, 'assets3d.create.errors.concept')
    .regex(DATA_URI_RE, 'assets3d.create.errors.type'),
})

type CreateAssetValues = z.infer<typeof createAssetSchema>

export type CreateAssetModalProps = {
  isOpen: boolean
  onClose: () => void
}

// Read a picked file into a data URI, refusing anything the contract would.
// Returns an i18n KEY on failure for the same reason the schema does.
type ReadResult = { ok: true; dataUri: string } | { ok: false; errorKey: string }

function readConceptImage(file: File): Promise<ReadResult> {
  // Type is checked BEFORE reading: an svg should never even be decoded
  if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
    return Promise.resolve({ ok: false, errorKey: 'assets3d.create.errors.type' })
  }
  if (file.size > MAX_FILE_BYTES) {
    return Promise.resolve({ ok: false, errorKey: 'assets3d.create.errors.read' })
  }
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      // readAsDataURL always yields a string; the guard keeps the type airtight
      if (typeof reader.result === 'string' && DATA_URI_RE.test(reader.result)) {
        resolve({ ok: true, dataUri: reader.result })
      } else {
        resolve({ ok: false, errorKey: 'assets3d.create.errors.type' })
      }
    }
    // An unreadable file is indistinguishable from a read failure to the user
    reader.onerror = () => resolve({ ok: false, errorKey: 'assets3d.create.errors.read' })
    reader.readAsDataURL(file)
  })
}

export function CreateAssetModal({ isOpen, onClose }: CreateAssetModalProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const createAsset = useCreateAsset()
  // Server failure as a localized KEY — never the raw envelope text (design.md §9)
  const [serverErrorKey, setServerErrorKey] = useState<string | null>(null)

  const {
    control,
    register,
    handleSubmit,
    setValue,
    setError,
    formState: { errors },
  } = useForm<CreateAssetValues>({
    resolver: zodResolver(createAssetSchema),
    defaultValues: { title: '', conceptImage: '' },
  })

  // The encoded concept drives the preview. It lives in FORM state (not a
  // separate useState) so zod owns its validity and one error path serves both
  // "you picked nothing" and "you picked an svg".
  //
  // `useWatch`, not the destructured `watch()`: RHF's `watch` is a fresh
  // unmemoizable function every render, which makes the React Compiler bail out
  // of optimizing this whole component. The subscription hook is the supported
  // equivalent and keeps the compiler on.
  const conceptImage = useWatch({ control, name: 'conceptImage' })

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Reset so re-picking the same file fires change again
    event.target.value = ''
    if (!file) return
    void readConceptImage(file).then((result) => {
      if (result.ok) {
        setValue('conceptImage', result.dataUri, { shouldValidate: true })
      } else {
        // Clear first: a rejected pick must not leave the previous image staged
        // under an error message that describes the new one.
        setValue('conceptImage', '')
        setError('conceptImage', { message: result.errorKey })
      }
    })
  }

  const onSubmit = (values: CreateAssetValues) => {
    setServerErrorKey(null)
    createAsset.mutate(
      { title: values.title.trim(), conceptImage: values.conceptImage },
      {
        // Land the user in the wizard of the asset they just made — the whole
        // point of creating one is the next stage, not the list
        onSuccess: (created) =>
          void navigate({ to: '/assets/$assetId', params: { assetId: created.id } }),
        onError: (error) =>
          setServerErrorKey(
            error instanceof ApiClientError
              ? errorCodeMessageKey(error.code)
              : 'errors.actionFailed',
          ),
      },
    )
  }

  const conceptError = errors.conceptImage?.message

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('assets3d.create.title')}>
      {/* noValidate: zod owns validation — native bubbles would preempt our copy */}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <Input
          label={t('assets3d.create.name')}
          placeholder={t('assets3d.create.namePlaceholder')}
          error={errors.title ? t(errors.title.message ?? 'errors.actionFailed') : undefined}
          {...register('title')}
        />

        {/* Controller only to keep the field registered while its value is set
            imperatively by the FileReader — the input itself is uncontrolled */}
        <Controller
          control={control}
          name="conceptImage"
          render={() => (
            <div className="flex flex-col gap-2">
              {/* A real <label> wrapping a visually-hidden file input: clicking
                  the plate opens the picker natively, and getByLabelText finds
                  the control — no aria-label crutch, no click-forwarding hack */}
              <label className="flex cursor-pointer flex-col gap-1.5">
                <span className="text-xs text-mist-dim">{t('assets3d.create.concept')}</span>
                {conceptImage ? (
                  // The concept is CONTENT: a recessed well plate, never glass
                  <Card surface="well" padding="none" className="overflow-hidden">
                    <img
                      src={conceptImage}
                      alt={t('assets3d.create.conceptAlt')}
                      className="max-h-56 w-full object-contain"
                    />
                  </Card>
                ) : (
                  // Dashed hairline dropzone on the void (the ImageDrop voice):
                  // hover brightens the line and steps toward ridge
                  <span className="rounded-lg border border-dashed border-white/15 px-4 py-6 text-center text-sm text-mist-dim transition-colors duration-200 hover:border-white/30 hover:bg-ridge/30">
                    {t('assets3d.create.conceptHint')}
                  </span>
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={handleFileChange}
                />
              </label>
              {conceptImage ? (
                <span className="text-xs text-mist-dim">{t('assets3d.create.replace')}</span>
              ) : null}
              {conceptError ? (
                <span role="alert" className="text-sm text-glow-red">
                  {t(conceptError)}
                </span>
              ) : null}
            </div>
          )}
        />

        {serverErrorKey ? (
          // Inline non-blocking failure: a calm recessed block with a glow-red
          // LEFT RULE — red marks the status, never the whole surface
          <p
            role="alert"
            className="rounded-lg border-l-2 border-glow-red bg-abyss px-4 py-3 text-sm text-mist"
          >
            {t(serverErrorKey)}
          </p>
        ) : null}

        {/* Said out loud, because an upload box implies a charge is coming */}
        <p className="text-xs text-mist-dim">{t('assets3d.create.free')}</p>

        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" isLoading={createAsset.isPending}>
            {t('assets3d.create.submit')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
