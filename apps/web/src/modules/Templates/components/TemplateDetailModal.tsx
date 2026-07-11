// apps/web/src/modules/Templates/components/TemplateDetailModal.tsx
// The commit surface: read what the template is, turn its knobs, pick a price,
// and land in the editor with a built timeline.
//
// The order of this sheet is the order of the decision:
//   1. what this format IS (description + beat list)   — do I want it?
//   2. the knobs (who cheats on whom)                  — do I want THIS one?
//   3. the price (tier picker, with affordability)     — can I have it?
//   4. one button.
//
// WHAT THIS BUTTON DOES NOT DO: spend money. Instantiating writes a film and nine
// draft shots and charges zero credits. The tier is a *pin*, not a purchase — it
// decides which model each shot will use WHEN the user later generates it, one
// beat at a time, having seen the prompt. The copy under the button says so,
// because a screen that shows you a 1120-credit number next to a big amber button
// is otherwise asking to be misread.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import type { TemplateSummary, TemplateTier } from '@opencreate/contracts'
import { Button, Card, ErrorState, Input, Modal, Select } from 'shared/ui'
import { useBalance, useCreateFilmFromTemplate } from '../model/templatesApi'
import { BeatList } from './BeatSheet'
import { TierPicker } from './TierPicker'

export type TemplateDetailModalProps = {
  // null = closed. Non-null = this template's sheet is open.
  template: TemplateSummary | null
  onClose: () => void
}

// Seed the form from every variable's declared default, so the sheet opens on a
// valid, generatable film — the user may press Create without touching a thing.
const initialValues = (template: TemplateSummary): Record<string, string> =>
  Object.fromEntries(template.variables.map((v) => [v.key, v.defaultValue]))

export function TemplateDetailModal({ template, onClose }: TemplateDetailModalProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const create = useCreateFilmFromTemplate()
  const balance = useBalance()

  // Keyed by template.id upstream, so a fresh sheet always holds a fresh draft.
  // (Same discipline as ShotInspector: no useEffect syncing props into state.)
  const [values, setValues] = useState<Record<string, string>>(() =>
    template ? initialValues(template) : {},
  )
  const [tier, setTier] = useState<TemplateTier>('standard')

  if (!template) return null

  const offer = template.tiers.find((o) => o.tier === tier)
  const canAfford =
    balance.data === undefined || offer === undefined || balance.data.creditsBalance >= offer.credits
  // A text knob left empty would be substituted as an empty line into a spoken
  // beat — the server rejects it, but the button should never have been live.
  const isComplete = template.variables.every((v) => (values[v.key] ?? '').trim().length > 0)

  const handleCreate = () => {
    create.mutate(
      { templateId: template.id, tier, variables: values },
      {
        // Land the user in the editor of the film they just built. ['film', id] was
        // seeded from this response, so the timeline is already there — no skeleton.
        onSuccess: (detail) =>
          void navigate({ to: '/cinema/$filmId', params: { filmId: detail.film.id } }),
      },
    )
  }

  return (
    <Modal isOpen onClose={onClose} title={template.name} size="lg">
      <div className="flex flex-col gap-6">
        <p className="text-sm leading-relaxed text-mist-dim">{template.description}</p>

        {/* 1 — the shape of the film */}
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-normal text-mist-dim">
            {t('templates.detail.beats', {
              beats: template.shotCount,
              seconds: template.totalDurationSeconds,
            })}
          </h3>
          <BeatList beats={template.beats} />
        </section>

        {/* 2 — the knobs */}
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-normal text-mist-dim">{t('templates.detail.variables')}</h3>
          {template.variables.map((variable) =>
            variable.kind === 'select' ? (
              <Select
                key={variable.key}
                label={variable.label}
                options={(variable.options ?? []).map((option) => ({
                  value: option.value,
                  label: option.label,
                }))}
                value={values[variable.key] ?? variable.defaultValue}
                onChange={(value) => setValues((prev) => ({ ...prev, [variable.key]: value }))}
              />
            ) : (
              <div key={variable.key} className="flex flex-col gap-1.5">
                <Input
                  label={variable.label}
                  maxLength={variable.maxLength}
                  value={values[variable.key] ?? variable.defaultValue}
                  onChange={(event) =>
                    setValues((prev) => ({ ...prev, [variable.key]: event.target.value }))
                  }
                />
                {variable.hint ? (
                  <p className="text-xs text-mist-dim/70">{variable.hint}</p>
                ) : null}
              </div>
            ),
          )}
        </section>

        {/* 3 — the price */}
        <TierPicker
          offers={template.tiers}
          value={tier}
          onChange={setTier}
          balance={balance.data?.creditsBalance}
        />

        {/* The music bed the template recommends. Shown, not hidden, because it is
            pre-filled into the editor's audio panel and the user should not be
            surprised to find it there. */}
        {template.musicPrompt ? (
          <Card surface="well">
            <p className="text-xs text-mist-dim">
              <span className="text-mist-dim/70">{t('templates.detail.music')} </span>
              {template.musicPrompt}
            </p>
          </Card>
        ) : null}

        {create.isError ? (
          <ErrorState message={t('templates.detail.createFailed')} onRetry={handleCreate} />
        ) : null}

        {/* 4 — the action, and the sentence that keeps the number above from being
            read as a charge. */}
        <div className="flex flex-col gap-3 border-t border-white/10 pt-4">
          <p className="text-xs text-mist-dim">{t('templates.detail.freeNotice')}</p>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleCreate}
              isLoading={create.isPending}
              disabled={!isComplete || !canAfford || create.isPending}
            >
              {t('templates.detail.create')}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
