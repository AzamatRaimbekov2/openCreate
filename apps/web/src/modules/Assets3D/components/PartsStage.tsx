// apps/web/src/modules/Assets3D/components/PartsStage.tsx
// The FREE stage — the only one in the wizard where nothing is charged, and the
// one that decides how well every paid step downstream turns out. A part's name
// becomes its extraction prompt, so this checklist is where the money is really
// spent; it just does not look like it yet.
//
// Two ways in, deliberately:
//   · ANALYSE — Claude reads the concept and proposes a breakdown. Free, so it
//     is NOT confirmed: a dialog in front of a costless act only teaches the
//     user to click through dialogs, which is exactly the reflex the paid stages
//     depend on them not having.
//   · BY HAND — the same checklist, typed. This path is not a fallback, it is
//     the guarantee: the wizard must stay fully usable on a deployment with no
//     ANTHROPIC_API_KEY, so a `provider_error` degrades to a notice, never to a
//     dead stage.
//
// The stage owns which row is open for editing (the rows are controlled — see
// PartChecklistItem) and prints the extraction price BEFORE the CTA that walks
// the user into the paid stage: the first time they see a number should not be
// the moment it is already being charged.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MAX_PARTS } from '@opencreate/contracts'
import type { Asset3dPart, CatalogModel } from '@opencreate/contracts'
import { ApiClientError } from 'shared/libs/apiClient'
import { errorCodeMessageKey } from 'shared/libs/errorCopy'
import { Button, Card, EmptyState, Input } from 'shared/ui'
import { useAddPart, useAnalyze, useDeletePart, useUpdatePart } from '../model/asset3dApi'
import { extractionPrice } from '../model/assetPricing'
import { useWizardStore } from '../model/wizardStore'
import { PartChecklistItem } from './PartChecklistItem'
import { PriceTag } from './PriceTag'

export type PartsStageProps = {
  // The asset being broken down
  assetId: string
  // Its current parts (from the wizard's aggregate query — this stage never
  // fetches; the shell owns the 4 states of the load)
  parts: Asset3dPart[]
  // The live catalog, for the extraction price printed next to the forward CTA.
  // Empty while it loads: the price pulses rather than lying.
  models: CatalogModel[]
}

export function PartsStage({ assetId, parts, models }: PartsStageProps) {
  const { t } = useTranslation()
  const setStageOverride = useWizardStore((state) => state.setStageOverride)

  // Which row is open for editing, and the new-part draft. Local `useState`
  // rather than the wizard store: nothing outside this stage reads either, and
  // the store's own header rule is that it holds only cross-component UI facts.
  const [editingPartId, setEditingPartId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')

  const analyzeMutation = useAnalyze()
  const addMutation = useAddPart()
  const updateMutation = useUpdatePart()
  const deleteMutation = useDeletePart()

  const isAtCap = parts.length >= MAX_PARTS
  const canAdd = draftName.trim().length > 0 && !isAtCap
  const price = extractionPrice(models)

  // Every failure on this stage is a mutation failure, and every one of them is
  // shown in OUR words: the API reports a machine-readable code precisely so a
  // provider's English sentence never lands under a Russian heading. Analysis is
  // called out separately because its failure has a specific, actionable meaning
  // ("not configured") rather than "something went wrong".
  const analyzeError =
    analyzeMutation.error instanceof ApiClientError
      ? analyzeMutation.error.code === 'provider_error'
        ? t('assets3d.parts.analyzeUnavailable')
        : t(errorCodeMessageKey(analyzeMutation.error.code))
      : analyzeMutation.isError
        ? t('assets3d.parts.analyzeUnavailable')
        : null

  const writeError = [addMutation.error, updateMutation.error, deleteMutation.error].find(
    (error): error is ApiClientError => error instanceof ApiClientError,
  )

  const isBusy =
    addMutation.isPending || updateMutation.isPending || deleteMutation.isPending

  const handleAdd = () => {
    if (!canAdd) return
    addMutation.mutate(
      { assetId, input: { name: draftName.trim() } },
      // Clear only on success: a rejected name should stay in the field for the
      // user to fix, not vanish along with the attempt
      { onSuccess: () => setDraftName('') },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card padding="lg">
        <div className="flex flex-col gap-4">
          {/* ── Analyse: free, one click, no dialog ── */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-mist-dim">{t('assets3d.parts.analyzeFree')}</p>
            <Button
              variant="ghost"
              onClick={() => analyzeMutation.mutate(assetId)}
              isLoading={analyzeMutation.isPending}
              disabled={isAtCap}
            >
              {parts.length === 0
                ? t('assets3d.parts.analyze')
                : t('assets3d.parts.analyzeAgain')}
            </Button>
          </div>

          {analyzeError ? (
            // Calm inline alert on the steel step with the glow-red status rule
            // — the design law keeps red for the STATUS, never the whole surface
            <p
              role="alert"
              className="rounded-lg border-l-2 border-glow-red bg-steel px-3 py-2 text-sm text-mist"
            >
              {analyzeError}
            </p>
          ) : null}

          {/* ── The checklist ── */}
          {parts.length === 0 ? (
            <EmptyState
              title={t('assets3d.parts.empty.title')}
              description={t('assets3d.parts.empty.description')}
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {parts.map((part) => (
                <PartChecklistItem
                  key={part.id}
                  part={part}
                  isEditing={editingPartId === part.id}
                  isBusy={isBusy}
                  onEdit={() => setEditingPartId(part.id)}
                  onCancel={() => setEditingPartId(null)}
                  onSave={(input) =>
                    updateMutation.mutate(
                      { assetId, partId: part.id, input },
                      { onSuccess: () => setEditingPartId(null) },
                    )
                  }
                  onRemove={() => deleteMutation.mutate({ assetId, partId: part.id })}
                />
              ))}
            </ul>
          )}

          {writeError ? (
            <p
              role="alert"
              className="rounded-lg border-l-2 border-glow-red bg-steel px-3 py-2 text-sm text-mist"
            >
              {t(errorCodeMessageKey(writeError.code))}
            </p>
          ) : null}

          {/* ── Add by hand ── */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1">
              <Input
                label={t('assets3d.parts.nameLabel')}
                placeholder={t('assets3d.parts.namePlaceholder')}
                value={draftName}
                maxLength={80}
                disabled={isAtCap}
                onChange={(event) => setDraftName(event.target.value)}
                // Enter is how a list gets typed. Making the user reach for the
                // mouse between every part is what turns a 12-row checklist into
                // a chore nobody finishes properly.
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    handleAdd()
                  }
                }}
              />
            </div>
            <Button onClick={handleAdd} disabled={!canAdd} isLoading={addMutation.isPending}>
              {t('assets3d.parts.add')}
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-mist-dim">
              {t('assets3d.parts.count', { total: parts.length, max: MAX_PARTS })}
            </p>
            {/* The cap is explained, not just enforced: a disabled button with
                no reason reads as a bug, and the reason here is real (VRAM) */}
            {isAtCap ? (
              <p className="text-xs text-glow-amber">{t('assets3d.parts.capped')}</p>
            ) : null}
          </div>
        </div>
      </Card>

      {/* ── The doorway into the paid half of the wizard ── */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <p className="text-xs text-mist-dim">
          {t('assets3d.parts.extractionPrice')} · <PriceTag credits={price} />
        </p>
        <Button onClick={() => setStageOverride('extract')} disabled={parts.length === 0}>
          {t('assets3d.parts.next')}
        </Button>
      </div>
    </div>
  )
}
