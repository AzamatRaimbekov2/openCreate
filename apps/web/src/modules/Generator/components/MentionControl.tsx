// apps/web/src/modules/Generator/components/MentionControl.tsx
// The composer's "@" affordance: pick an entity to tag, see the active tag as a
// chip, remove it. Inserting a tag appends its opaque [[eN]] token to the prompt
// and registers the mention in the store; the API composes the real text.
//
// It takes its entity list as a PROP. Generator must not import modules/Entities
// (cross-module law) — the route injects the list, exactly as it injects
// onRegenerate for Gallery. This component knows names and ids, nothing else.
import { useTranslation } from 'react-i18next'
import { Menu } from 'shared/ui'
import type { EntityRef } from '@opencreate/contracts'
import { deriveEntityRefs } from '../model/mentions'

// The minimum an entity needs to be taggable — id to reference, name to show, and
// an optional reference-image thumbnail the inline "@" picker renders (this chip
// control ignores it; see MentionAutocomplete).
export type TaggableEntity = { id: string; name: string; imageUrl?: string | null }

export type MentionControlProps = {
  // Taggable entities (route-injected). Empty while the library is empty.
  entities: TaggableEntity[]
  // Current prompt text — the source of truth for which tags are LIVE
  prompt: string
  // Registered placeholder→entity mappings
  mentions: EntityRef[]
  // Register an entity and append its token to the prompt
  onAdd: (entityId: string) => void
  // Drop a mention and strip its token from the prompt
  onRemove: (placeholder: string) => void
}

export function MentionControl({ entities, prompt, mentions, onAdd, onRemove }: MentionControlProps) {
  const { t } = useTranslation()

  // LIVE tags = mappings whose token is still in the text. A chip for a token the
  // user already deleted would lie about what will be sent.
  const active = deriveEntityRefs(prompt, mentions)
  const nameOf = (entityId: string) => entities.find((e) => e.id === entityId)?.name ?? entityId

  // v1 sends a single reference (contract cap). Once one tag is live, adding is
  // disabled rather than silently dropped at submit.
  const atCap = active.length >= 1

  return (
    <div className="flex flex-col gap-1.5">
      <span aria-hidden="true" className="text-[11px] leading-none text-mist-dim">
        {t('generator.mention.label')}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {active.map((ref) => (
          <span
            key={ref.placeholder}
            className="inline-flex items-center gap-1 rounded-full border border-glow-amber/40 bg-white/5 px-2 py-1 text-xs text-mist"
          >
            {/* Amber marks a bound reference, matching the model-picker language */}
            <span className="text-glow-amber">@</span>
            {nameOf(ref.entityId)}
            <button
              type="button"
              onClick={() => onRemove(ref.placeholder)}
              aria-label={t('generator.mention.remove', { name: nameOf(ref.entityId) })}
              className="text-mist-dim transition-colors duration-200 hover:text-white"
            >
              ✕
            </button>
          </span>
        ))}

        {entities.length === 0 ? (
          // Nothing to tag yet — a quiet hint beats a dead button
          <span className="text-xs text-mist-dim">{t('generator.mention.empty')}</span>
        ) : atCap ? null : (
          <Menu
            label={t('generator.mention.add')}
            align="start"
            items={entities.map((entity) => ({
              id: entity.id,
              label: entity.name,
              onSelect: () => onAdd(entity.id),
            }))}
            triggerClassName="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-mist-dim transition-colors duration-200 hover:border-white/30 hover:text-white focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
          >
            <span aria-hidden="true">@</span>
            {t('generator.mention.add')}
          </Menu>
        )}
      </div>
    </div>
  )
}
