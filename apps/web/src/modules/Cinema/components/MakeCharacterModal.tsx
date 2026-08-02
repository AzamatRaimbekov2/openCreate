// apps/web/src/modules/Cinema/components/MakeCharacterModal.tsx
// "Make a character from this reference" — a small naming dialog over ONE attached
// shot reference. It turns a one-off "make it look like this" picture into a
// reusable, taggable Entity: the user names it, and useMakeCharacterFromReference
// creates the character + attaches the picture as its reference photo. On success
// it hands the new entity id up so the parent can auto-@mention it in the prompt.
//
// SCOPE (why this owns so little): this component owns ONLY the create — the name
// field, the pending state, and the localized failure notice — and it stays OPEN
// on error so the typed name is never lost. Everything downstream of a successful
// create (removing the now-redundant raw reference, tagging the character, the
// confirmation toast) is the PARENT's job (ShotReferenceImages), because those are
// shot-level effects the parent's own mutations already handle. So the create
// lives with its own state; the shot bookkeeping stays where the shot lives.
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiClientError } from 'shared/libs/apiClient'
import { errorCodeMessageKey } from 'shared/libs/errorCopy'
import { Button, Card, Input, Modal } from 'shared/ui'
import { useMakeCharacterFromReference } from '../model/makeCharacterApi'

export type MakeCharacterModalProps = {
  // The attached reference's /media URL — shown as the preview AND re-homed as
  // the new character's reference photo (the hook fetches these bytes).
  imageUrl: string
  // Close without creating (Escape / overlay / ✕ / Cancel)
  onClose: () => void
  // The new character's id — the parent removes the raw ref, tags it, and toasts.
  onCreated: (entityId: string) => void
}

export function MakeCharacterModal({ imageUrl, onClose, onCreated }: MakeCharacterModalProps) {
  const { t } = useTranslation()
  const make = useMakeCharacterFromReference()
  const [name, setName] = useState('')

  const trimmed = name.trim()
  // Empty name or an in-flight create both block submit — the button also shows
  // the spinner while pending, so a double-submit can never double-create.
  const canSubmit = trimmed.length > 0 && !make.isPending

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit) return
    // Only report success UP; the modal itself never closes — the parent closes
    // it after wiring the shot-level effects, so a failure leaves us open.
    make.mutate({ name: trimmed, imageUrl }, { onSuccess: (entity) => onCreated(entity.id) })
  }

  // A create failure → the machine code's localized copy (never raw server text,
  // design.md §9). A non-ApiClientError (e.g. the reference fetch failed) has no
  // code, so it degrades to the generic make-character error line.
  const errorKey = make.error
    ? make.error instanceof ApiClientError
      ? errorCodeMessageKey(make.error.code)
      : 'cinema.shotRef.makeCharacterError'
    : null

  return (
    <Modal isOpen onClose={onClose} title={t('cinema.shotRef.makeCharacterModalTitle')}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* The reference in a recessed `well` plate (the surface reserved for user
            media) so the user names the exact picture in front of them. alt="" —
            the field label below carries the meaning. */}
        <Card surface="well" padding="none" className="mx-auto size-40 overflow-hidden">
          <img src={imageUrl} alt="" className="size-full object-cover" />
        </Card>

        {/* name is 1–80 chars server-side; cap the field so the wire can't 400 */}
        <Input
          label={t('cinema.shotRef.makeCharacterNamePlaceholder')}
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
        />

        {errorKey ? (
          <p role="alert" className="text-xs text-glow-red">
            {t(errorKey)}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" size="sm" isLoading={make.isPending} disabled={!canSubmit}>
            {t('cinema.shotRef.makeCharacterSubmit')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
