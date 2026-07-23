// apps/web/src/modules/Assets3D/components/PartChecklistItem.tsx
// One row of the parts checklist: a name, an optional description, and the two
// acts a draft part supports — rename and remove.
//
// It is CONTROLLED by the stage (the SoulConstructor precedent): the row does
// not own the draft it is editing. Analysis can REPLACE the whole part list
// underneath the user, so a row that owned its own edit buffer would keep
// showing a name for a part the server has already dropped. The stage owns
// which row is open; the row owns only the keystrokes inside it.
//
// A part's name is not decoration — it is the extraction PROMPT. "Left pauldron"
// and "shoulder thing" produce different images for the same money, which is why
// editing is a first-class affordance here rather than something buried in a menu.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Asset3dPart } from '@opencreate/contracts'
import { Button, Input } from 'shared/ui'

export type PartChecklistItemProps = {
  // The part this row shows
  part: Asset3dPart
  // Whether the row is in edit mode — owned by the stage (see the header)
  isEditing: boolean
  // Enter edit mode on this row (the stage closes any other open row)
  onEdit: () => void
  // Leave edit mode without writing
  onCancel: () => void
  // Commit the edited name/description
  onSave: (input: { name: string; description: string }) => void
  // Remove the part entirely
  onRemove: () => void
  // A mutation is in flight — both acts are held until it settles
  isBusy: boolean
}

export function PartChecklistItem({
  part,
  isEditing,
  onEdit,
  onCancel,
  onSave,
  onRemove,
  isBusy,
}: PartChecklistItemProps) {
  const { t } = useTranslation()
  // The edit buffer. Keyed by nothing on purpose: the stage unmounts the editing
  // branch when it closes the row, so the buffer cannot survive into a stale edit.
  const [name, setName] = useState(part.name)
  const [description, setDescription] = useState(part.description)

  // An empty name is not a part — the contract's min(1) would reject it, and a
  // disabled Save says so before the round-trip does
  const isNamed = name.trim().length > 0

  if (isEditing) {
    return (
      <li className="flex flex-col gap-3 rounded-lg border border-white/10 px-4 py-3">
        <Input
          label={t('assets3d.parts.nameLabel')}
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
        />
        <Input
          label={t('assets3d.parts.descriptionLabel')}
          value={description}
          maxLength={600}
          placeholder={t('assets3d.parts.descriptionPlaceholder')}
          onChange={(event) => setDescription(event.target.value)}
        />
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button
            size="sm"
            disabled={!isNamed || isBusy}
            onClick={() => onSave({ name: name.trim(), description: description.trim() })}
          >
            {t('assets3d.parts.save')}
          </Button>
        </div>
      </li>
    )
  }

  return (
    <li className="flex items-start justify-between gap-3 rounded-lg border border-white/10 px-4 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm text-mist">{part.name}</span>
        {part.description ? (
          <span className="truncate text-xs text-mist-dim">{part.description}</span>
        ) : null}
      </div>
      {/* Both controls name the PART, not the verb: a screen-reader user walking
          a twelve-row list by button hears "Remove Helmet", not "Remove" twelve
          times over with no way to tell which one is which. */}
      <div className="flex shrink-0 items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onEdit}
          disabled={isBusy}
          aria-label={t('assets3d.parts.editLabel', { name: part.name })}
        >
          {t('common.edit')}
        </Button>
        <Button
          variant="danger"
          size="sm"
          onClick={onRemove}
          disabled={isBusy}
          aria-label={t('assets3d.parts.removeLabel', { name: part.name })}
        >
          ✕
        </Button>
      </div>
    </li>
  )
}
