// apps/web/src/modules/Soul/components/TraitPicker.tsx
// The multi-select axis — the one the owner actually asked for: missing eye, iron
// arm, horns, scars. Rendered as chip groups straight from TRAIT_GROUPS, so a
// trait added to contracts appears here with no code change.
//
// THE CAP IS THE POINT OF THIS COMPONENT. A text encoder drops concepts past a
// handful: a 15-trait character silently renders as a 4-trait one, and the user
// paid for all fifteen. So at six the remaining chips are DISABLED (not merely
// ignored on click) and a role="status" line says why — the refusal has to be
// visible, or the product looks broken instead of principled.
import { useTranslation } from 'react-i18next'
import { MAX_TRAITS, TRAITS, TRAIT_GROUPS } from '@opencreate/contracts'
import type { TraitId } from '@opencreate/contracts'
import { isTraitDisabled } from '../model/soulDraft'

export type TraitPickerProps = {
  // The picked traits, in pick order (the composer keeps that order)
  traits: TraitId[]
  // Toggle one trait — the parent runs it through toggleTrait (the cap refuses there too)
  onToggle: (traitId: TraitId) => void
}

// Chip anatomy mirrors the entity preset chips: a quiet white/5 wash at rest, the
// AMBER specimen tint when picked (the design system's selection language — see
// PillGroup), and a plain 50% dim when the cap has closed the door.
const CHIP_BASE =
  'min-h-8 rounded-full border px-3 py-1 text-xs transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40'
const CHIP_SELECTED = 'border-white/10 bg-specimen-amber/20 text-lumen-amber'
const CHIP_IDLE = 'border-white/10 bg-white/5 text-mist-dim hover:bg-ridge hover:text-white'

export function TraitPicker({ traits, onToggle }: TraitPickerProps) {
  const { t } = useTranslation()
  const isFull = traits.length >= MAX_TRAITS

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-mist-dim">{t('soul.field.traits')}</span>
        {/* The counter is the quiet half of the cap; the loud half is below.
            The variable is `picked`, not `count` — `count` would put i18next into
            plural-resolution mode and look for keys (_one/_few/_many) we do not
            need for "3 / 6". */}
        <span className="text-xs text-mist-dim">
          {t('soul.traits.count', { picked: traits.length, max: MAX_TRAITS })}
        </span>
      </div>

      {TRAIT_GROUPS.map((group) => (
        <div key={group.id} className="flex flex-col gap-2">
          {/* Group labels are contract DATA (already Russian), not app copy */}
          <span className="text-[11px] text-mist-dim/70">{group.label}</span>
          <div role="group" aria-label={group.label} className="flex flex-wrap gap-1.5">
            {group.traits.map((traitId) => {
              const isSelected = traits.includes(traitId)
              return (
                <button
                  key={traitId}
                  type="button"
                  aria-pressed={isSelected}
                  disabled={isTraitDisabled(traits, traitId)}
                  onClick={() => onToggle(traitId)}
                  className={`${CHIP_BASE} ${isSelected ? CHIP_SELECTED : CHIP_IDLE}`}
                >
                  {TRAITS[traitId].label}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {/* role=status: the cap arrives while the user is clicking, so it must be
          announced, not just drawn. Amber, not red — nothing failed; the studio
          is protecting the render the user is about to pay for. */}
      {isFull ? (
        <p role="status" className="text-xs text-glow-amber">
          {t('soul.traits.cap', { max: MAX_TRAITS })}
        </p>
      ) : null}
    </div>
  )
}
