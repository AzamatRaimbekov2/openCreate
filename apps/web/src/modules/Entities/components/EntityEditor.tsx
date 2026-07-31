// apps/web/src/modules/Entities/components/EntityEditor.tsx
// Create-or-edit an entity in a modal: name, kind, description (with preset
// snippet chips), and the photo set with primary election. One component for
// both modes — a null `entity` means "create", an entity means "edit" — because
// the fields and validation are identical and forking them would drift.
import { useState } from 'react'
import type { ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { Entity, EntityKind } from '@opencreate/contracts'
import { Button, Input, Modal, Select } from 'shared/ui'
import { useAddEntityImage, useCreateEntity, useUpdateEntity } from '../model/entitiesApi'
import { PRESET_KEYS } from '../model/entityPresets'

export type EntityEditorProps = {
  // null → create mode; an entity → edit mode
  entity: Entity | null
  isOpen: boolean
  onClose: () => void
}

const KINDS: EntityKind[] = ['character', 'object', 'place', 'other']
// Same 10MB file cap the API enforces (contracts 14MB base64 ≈ 10MB file). The
// API's dataUri.ts is the real gate; this is a courtesy fast-fail.
const MAX_FILE_BYTES = 10 * 1024 * 1024

export function EntityEditor({ entity, isOpen, onClose }: EntityEditorProps) {
  const { t } = useTranslation()
  const createMutation = useCreateEntity()
  const updateMutation = useUpdateEntity()
  const addImageMutation = useAddEntityImage()

  const [name, setName] = useState(entity?.name ?? '')
  const [kind, setKind] = useState<EntityKind>(entity?.kind ?? 'character')
  const [description, setDescription] = useState(entity?.description ?? '')
  const [errorKey, setErrorKey] = useState<string | null>(null)

  const isEdit = entity !== null
  const isBusy =
    createMutation.isPending || updateMutation.isPending || addImageMutation.isPending

  const appendPreset = (key: string) => {
    const snippet = t(key)
    setDescription((current) => (current.trim() ? `${current.trim()}, ${snippet}` : snippet))
  }

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !entity) return
    if (!file.type.startsWith('image/')) return setErrorKey('generator.image.errors.type')
    if (file.size > MAX_FILE_BYTES) return setErrorKey('generator.image.errors.size')
    setErrorKey(null)
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        addImageMutation.mutate({ id: entity.id, input: { dataUri: reader.result, source: 'upload' } })
      }
    }
    reader.readAsDataURL(file)
  }

  const handleSave = () => {
    if (name.trim().length === 0) return setErrorKey('entities.errors.name')
    if (isEdit) {
      updateMutation.mutate(
        { id: entity.id, input: { name: name.trim(), description: description.trim() } },
        { onSuccess: onClose },
      )
    } else {
      // Kind is immutable after creation (it changes the reference semantics), so
      // it is only settable here in create mode
      createMutation.mutate(
        { kind, name: name.trim(), description: description.trim() },
        { onSuccess: onClose },
      )
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? t('entities.edit.title') : t('entities.create.title')}
    >
      {/* THE FIELDS SCROLL, THE ACTIONS DO NOT (design.md §6 Modal law). The kit
          Modal panel is a max-h-[92dvh] flex column and a flex child defaults to
          min-height:auto, so without min-h-0 this stack — name + description +
          preset chips + a photo grid that WRAPS as photos are added — paints past
          the panel bottom, the wheel scrolls the page behind the overlay, and
          Save becomes unreachable. Same class as the StyleEditor case. */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
        {/* Input owns its own label caption — no wrapping <label> needed */}
        <Input
          label={t('entities.field.name')}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />

        {/* Kind is fixed once created: it decides whether the reference is read
            as a face (Portrait) or a subject (Subject) */}
        {isEdit ? null : (
          <Select
            label={t('entities.field.kind')}
            options={KINDS.map((value) => ({ value, label: t(`entities.kind.${value}`) }))}
            value={kind}
            onChange={setKind}
          />
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-mist-dim">{t('entities.field.description')}</span>
          <textarea
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="rounded-lg border border-white/10 bg-steel px-3 py-2 text-base text-mist transition-colors duration-200 placeholder:text-mist-dim/60 focus-visible:border-portal focus-visible:outline-none"
          />
        </label>

        {/* Preset chips: a fast start, same click → same words, no LLM */}
        <div className="flex flex-wrap gap-1.5">
          {PRESET_KEYS[kind].map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => appendPreset(key)}
              className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-mist-dim transition-colors duration-200 hover:border-white/25 hover:text-white focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
            >
              + {t(key)}
            </button>
          ))}
        </div>

        {/* Photos: only in edit mode — an image needs an entity id to attach to.
            Creating first, then adding photos, keeps the upload path a single
            authorized endpoint. */}
        {isEdit ? (
          <div className="flex flex-col gap-2">
            <span className="text-xs text-mist-dim">{t('entities.field.photos')}</span>
            <div className="flex flex-wrap gap-2">
              {entity.images.map((image) => (
                <button
                  key={image.id}
                  type="button"
                  onClick={() =>
                    updateMutation.mutate({ id: entity.id, input: { primaryImageId: image.id } })
                  }
                  aria-label={t('entities.primary.set')}
                  className={`size-16 overflow-hidden rounded-lg border bg-abyss transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none ${
                    image.id === entity.primaryImageId ? 'border-glow-amber' : 'border-white/10'
                  }`}
                >
                  <img src={image.url} alt="" className="size-full object-cover" />
                </button>
              ))}
              <label className="flex size-16 cursor-pointer items-center justify-center rounded-lg border border-dashed border-white/15 text-mist-dim transition-colors duration-200 hover:border-white/30 hover:bg-ridge">
                <span aria-hidden="true" className="text-lg">
                  +
                </span>
                <input type="file" accept="image/*" className="sr-only" onChange={handleFile} />
              </label>
            </div>
            {/* The amber-bordered photo is the one sent as a reference */}
            <span className="text-[11px] text-mist-dim">{t('entities.primary.hint')}</span>
          </div>
        ) : null}

      </div>

      {/* PINNED footer — outside the scroller, so a growing photo grid cannot
          push Save out of reach. The failure notice sits here too: it explains
          why the button beside it did nothing, so it must be visible wherever
          that button is. */}
      <div className="mt-4 flex shrink-0 flex-col gap-3 border-t border-white/10 pt-4">
        {errorKey ? (
          <span role="alert" className="text-sm text-glow-red">
            {t(errorKey)}
          </span>
        ) : null}

        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} isLoading={isBusy} disabled={name.trim().length === 0}>
            {isEdit ? t('common.done') : t('entities.create.submit')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
