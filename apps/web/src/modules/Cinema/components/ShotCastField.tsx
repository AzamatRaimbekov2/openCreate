// apps/web/src/modules/Cinema/components/ShotCastField.tsx
// The shot's CAST: which characters appear in this beat. Tagging one appends its
// opaque `[[eN]]` token to the shot's prompt and registers the mapping; the API
// substitutes the character's name AND attaches her photo as a reference, so the
// fox in shot 2 is the same fox as in shot 1.
//
// This is the difference between a film and a pile of clips, and it is why the
// control lives on the SHOT rather than on the film: a cast is a per-beat fact
// (the fox is in shots 1–3, the bear enters in shot 4). A film-level cast would
// condition every shot on characters who are not in frame — paying to reference
// people nobody can see.
//
// NOT a copy of the Generator's MentionControl, despite the family resemblance:
// that one caps at ONE reference (an image model conditions on a single subject),
// while a film shot carries up to FIVE — Wan 2.7's r2v limit, which is what lets a
// scene hold a whole small cast. The shared half (the derive/append protocol) is
// imported from shared/libs; only the presentation differs.
//
// Takes its entity list as a PROP: Cinema must not import modules/Entities
// (cross-module law). The editor injects it.
import { useTranslation } from 'react-i18next'
import type { EntityRef } from '@opencreate/contracts'
import { deriveEntityRefs } from 'shared/libs/mentions'
import { Menu } from 'shared/ui'

// The minimum an entity needs to be castable here — id to reference, name to show
export type CastableEntity = { id: string; name: string }

// Wan 2.7 r2v's own ceiling. Enforced in the contract too; mirrored here so the
// "add" affordance simply disappears at the cap instead of offering a click that
// would be refused after the user had already arranged the shot.
export const MAX_CAST = 5

export type ShotCastFieldProps = {
  // Characters available to tag (route-injected). Empty while the library is empty.
  entities: CastableEntity[]
  // The shot's prompt — the SOURCE OF TRUTH for which tags are live. A chip for a
  // token the user already deleted from the text would lie about what gets sent.
  prompt: string
  // Registered placeholder→entity mappings for this shot
  cast: EntityRef[]
  // Register a character and append her token to the prompt
  onAdd: (entityId: string) => void
  // Drop a character and strip her token from the prompt
  onRemove: (placeholder: string) => void
  // False when the chosen model cannot use references at all — the control then
  // explains itself rather than letting the user tag a character the model would
  // silently ignore (and charge for).
  modelSupportsReferences: boolean
}

export function ShotCastField({
  entities,
  prompt,
  cast,
  onAdd,
  onRemove,
  modelSupportsReferences,
}: ShotCastFieldProps) {
  const { t } = useTranslation()

  // LIVE tags only — derived from the text, never from bookkeeping.
  const active = deriveEntityRefs(prompt, cast)
  const nameOf = (entityId: string) => entities.find((e) => e.id === entityId)?.name ?? entityId
  const atCap = active.length >= MAX_CAST
  const taggable = entities.filter((e) => !active.some((ref) => ref.entityId === e.id))

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {active.map((ref) => (
          <span
            key={ref.placeholder}
            className="inline-flex items-center gap-1 rounded-full border border-glow-amber/40 bg-white/5 px-2 py-1 text-xs text-mist"
          >
            {/* Amber marks a bound reference — same language as the model picker */}
            <span className="text-glow-amber">@</span>
            {nameOf(ref.entityId)}
            <button
              type="button"
              onClick={() => onRemove(ref.placeholder)}
              aria-label={t('cinema.cast.remove', { name: nameOf(ref.entityId) })}
              className="text-mist-dim transition-colors duration-200 hover:text-white"
            >
              ✕
            </button>
          </span>
        ))}

        {/* Four states, and each says something DIFFERENT — a single disabled
            button would leave the user guessing which of them they are in. */}
        {!modelSupportsReferences && active.length === 0 ? (
          <span className="text-xs text-mist-dim">{t('cinema.cast.unsupported')}</span>
        ) : entities.length === 0 ? (
          <span className="text-xs text-mist-dim">{t('cinema.cast.empty')}</span>
        ) : atCap || taggable.length === 0 ? null : (
          <Menu
            label={t('cinema.cast.add')}
            align="start"
            items={taggable.map((entity) => ({
              id: entity.id,
              label: entity.name,
              onSelect: () => onAdd(entity.id),
            }))}
            triggerClassName="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-mist-dim transition-colors duration-200 hover:border-white/30 hover:text-white focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
          >
            <span aria-hidden="true">@</span>
            {t('cinema.cast.add')}
          </Menu>
        )}
      </div>

      {/* The tag is live but the model cannot honour it: a warning, not a silent
          drop. Generating here would charge full price for a stranger. */}
      {!modelSupportsReferences && active.length > 0 ? (
        <p role="alert" className="text-xs text-glow-red">
          {t('cinema.cast.unsupportedWarning')}
        </p>
      ) : null}
    </div>
  )
}
