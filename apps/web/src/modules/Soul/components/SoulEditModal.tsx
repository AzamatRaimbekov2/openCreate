// apps/web/src/modules/Soul/components/SoulEditModal.tsx
// Reopen a built character in the constructor. Free — editing the spec generates
// nothing; the portraits already minted stay exactly as they are (a re-roll is a
// separate, priced act on the sheet).
//
// Saving PATCHes `{ name, soul }` and the server RE-DERIVES the description from
// the new soul (entity.ts invariant). That is why this modal cannot offer a
// description field: there is nothing the client could send that would be right.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Entity } from '@opencreate/contracts'
import { ApiClientError } from 'shared/libs/apiClient'
import { errorCodeMessageKey } from 'shared/libs/errorCopy'
import { Modal } from 'shared/ui'
import { useUpdateSoul } from '../model/soulApi'
import { draftFromEntity } from '../model/soulDraft'
import type { SoulDraft } from '../model/soulDraft'
import { SoulConstructor } from './SoulConstructor'

export type SoulEditModalProps = {
  entity: Entity
  isOpen: boolean
  onClose: () => void
}

export function SoulEditModal({ entity, isOpen, onClose }: SoulEditModalProps) {
  const { t } = useTranslation()
  const updateMutation = useUpdateSoul()
  // Seeded from the entity. The CARD mounts this component only while the editor
  // is open, so every reopen starts from the SAVED soul — an abandoned edit
  // cannot leak into the next one, and no effect is needed to "reset" the draft.
  const [draft, setDraft] = useState<SoulDraft>(() => draftFromEntity(entity))

  const error =
    updateMutation.error instanceof ApiClientError
      ? t(errorCodeMessageKey(updateMutation.error.code))
      : updateMutation.isError
        ? t('errors.actionFailed')
        : null

  const handleSave = () => {
    updateMutation.mutate(
      { id: entity.id, input: { name: draft.name.trim(), soul: draft.soul } },
      { onSuccess: onClose },
    )
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('soul.card.edit')} size="lg">
      <SoulConstructor
        draft={draft}
        onChange={setDraft}
        onSubmit={handleSave}
        submitLabel={t('soul.constructor.save')}
        isSubmitting={updateMutation.isPending}
        error={error}
      />
    </Modal>
  )
}
