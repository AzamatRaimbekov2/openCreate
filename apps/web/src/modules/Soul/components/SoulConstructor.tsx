// apps/web/src/modules/Soul/components/SoulConstructor.tsx
// The constructor: a character is BUILT here, from tables — never typed into a
// prompt box. Since the /soul recomposition (2026-07-21) this is the EDIT-MODAL
// form (SoulEditModal), not the studio page — the studio splits the same parts
// across three zones (SoulBuilder + SoulStage + SoulComposer). It stays because a
// modal wants the whole form in one column: the name field, the shared axes
// (SoulAxes), the live composed prompt (SoulPreview), and the submit pill.
//
// CONTROLLED, deliberately. The draft lives in the parent (the soul card's edit
// modal), because a component that owned its own state could only be reset by
// remounting it with a key — throwing away scroll and focus every time. The axes
// themselves live in SoulAxes so the studio's Builder cannot drift from this form.
import { useTranslation } from 'react-i18next'
import { Button, Card, Input } from 'shared/ui'
import type { SoulDraft } from '../model/soulDraft'
import { SoulAxes } from './SoulAxes'
import { SoulPreview } from './SoulPreview'

export type SoulConstructorProps = {
  // The draft being edited — owned by the parent (see the header)
  draft: SoulDraft
  onChange: (draft: SoulDraft) => void
  // Fired by the submit pill; the parent owns the mutation (create vs update)
  onSubmit: () => void
  // Localized label of the submit pill ("Create character" / "Save")
  submitLabel: string
  isSubmitting: boolean
  // Already-localized failure message, rendered as a calm inline alert
  error?: string | null | undefined
}

export function SoulConstructor({
  draft,
  onChange,
  onSubmit,
  submitLabel,
  isSubmitting,
  error = null,
}: SoulConstructorProps) {
  const { t } = useTranslation()

  const isNamed = draft.name.trim().length > 0

  return (
    <Card surface="glass" padding="lg" title={t('soul.constructor.title')}>
      <div className="flex flex-col gap-6">
        <Input
          label={t('soul.constructor.name')}
          placeholder={t('soul.constructor.namePlaceholder')}
          value={draft.name}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
        />

        {/* The axes are the SHARED body (SoulAxes) — the same pills, dropdowns,
            trait chips and notes the studio's Builder renders. Only the soul
            travels; the name above and the submit below are this form's own. */}
        <SoulAxes soul={draft.soul} onChange={(soul) => onChange({ ...draft, soul })} />

        <SoulPreview soul={draft.soul} />

        {error ? (
          // Calm inline failure: a steel block with the glow-red status rule (the
          // design law keeps red for the STATUS, never for the whole surface)
          <p
            role="alert"
            className="rounded-lg border-l-2 border-glow-red bg-steel px-3 py-2 text-sm text-mist"
          >
            {error}
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          {/* Creating a character costs NOTHING — say so, right next to the button,
              because everything else in this app charges credits and the user has
              learned to expect it */}
          <p className="text-xs text-mist-dim">{t('soul.constructor.free')}</p>
          <Button onClick={onSubmit} isLoading={isSubmitting} disabled={!isNamed}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </Card>
  )
}
