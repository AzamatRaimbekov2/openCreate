// apps/web/src/modules/Assets3D/components/MeshStage.tsx
// The heaviest per-part spend: an extracted image becomes real geometry. Two
// things make this stage different from extraction, and both are about cost.
//
// 1. EVERY MESH IS CONFIRMED (owner decision 2026-07-20, superseding the plan's
//    original "batch-only dialog" note). A single careless tap here can cost more
//    than an entire extraction pass, so mis-click parity with the batch matters
//    more than click economy. The dialog restates the picked TIER's credit
//    number; the confirm handler closes it FIRST, then mutates. Nothing is spent
//    by the bare click — that is asserted in MeshStage.test.tsx, because it is
//    the kind of guarantee that silently rots when someone "simplifies" later.
//
// 2. THE TIER IS PER PART. A hero prop and a background bolt do not deserve the
//    same mesh budget, and the price moves with the choice, so the picker and the
//    priced button must stay in sync per row — hence a Map of choices rather than
//    one stage-wide tier.
//
// A part that has not been extracted cannot be meshed: the server needs the
// isolated image as input. That is stated as a REASON on the plate, not as a
// disabled mystery button — a control with no explanation reads as a bug.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Asset3dPart, CatalogModel } from '@opencreate/contracts'
import { ApiClientError } from 'shared/libs/apiClient'
import { errorCodeMessageKey } from 'shared/libs/errorCopy'
import { Button, Card, EmptyState, Select, SpendConfirmModal } from 'shared/ui'
import { useMeshPart } from '../model/asset3dApi'
import { meshPrice, meshTierOptions } from '../model/assetPricing'
import { useWizardStore } from '../model/wizardStore'
import { PartGenerationCard } from './PartGenerationCard'
import { PriceTag } from './PriceTag'

export type MeshStageProps = {
  // The asset being meshed
  assetId: string
  // Its parts, from the wizard's aggregate (this stage never fetches the asset)
  parts: Asset3dPart[]
  // The live catalog — the source of the model3d tiers and their prices. Empty
  // while it loads: the stage then offers NO tier and NO spend at all.
  models: CatalogModel[]
}

export function MeshStage({ assetId, parts, models }: MeshStageProps) {
  const { t } = useTranslation()
  const meshMutation = useMeshPart()
  const setStageOverride = useWizardStore((state) => state.setStageOverride)

  const tiers = meshTierOptions(models)
  const defaultTierId = tiers[0]?.value ?? ''

  // Per-part tier choice; a part not in the map is on the first (cheapest listed)
  // tier. Keyed local state rather than the wizard store: no component outside
  // this stage reads it, and the store's contract is cross-component UI only.
  const [tierByPart, setTierByPart] = useState<Map<string, string>>(new Map())
  // The part whose spend is awaiting confirmation — the dialog is open exactly
  // while this is non-null, so the two can never disagree about what is charged.
  const [pendingPartId, setPendingPartId] = useState<string | null>(null)
  // Per-part mutation rejections; independent by construction (see ExtractStage).
  const [failures, setFailures] = useState<Map<string, string>>(new Map())

  const tierFor = (partId: string) => tierByPart.get(partId) ?? defaultTierId
  const pendingPart = parts.find((part) => part.id === pendingPartId) ?? null
  const pendingPrice =
    pendingPart === null ? null : meshPrice(models, tierFor(pendingPart.id))
  const pendingTierLabel =
    pendingPart === null
      ? ''
      : (tiers.find((tier) => tier.value === tierFor(pendingPart.id))?.label ?? '')

  // Parts that can be meshed at all: the server meshes the EXTRACTED image, so a
  // part with no extraction citation has no input to work from.
  const meshable = parts.filter((part) => part.imageGenerationId !== null)
  const isDone = meshable.length > 0 && meshable.every((part) => part.meshGenerationId !== null)

  const confirmMesh = () => {
    if (pendingPart === null) return
    const partId = pendingPart.id
    const modelId = tierFor(partId)
    // Close FIRST, then spend (design.md §9) — the user has answered; what they
    // want to watch now is the plate, not a spinner on the question
    setPendingPartId(null)
    setFailures((previous) => {
      const next = new Map(previous)
      next.delete(partId)
      return next
    })
    meshMutation.mutate(
      { assetId, partId, input: { modelId } },
      {
        onError: (error) => {
          const message =
            error instanceof ApiClientError
              ? t(errorCodeMessageKey(error.code))
              : t('errors.actionFailed')
          setFailures((previous) => new Map(previous).set(partId, message))
        },
      },
    )
  }

  if (parts.length === 0 || meshable.length === 0) {
    return (
      <EmptyState
        title={t('assets3d.mesh.empty.title')}
        description={t('assets3d.mesh.empty.description')}
        action={
          <Button variant="ghost" onClick={() => setStageOverride('extract')}>
            {t('assets3d.stage.extract')}
          </Button>
        }
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card padding="lg">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {parts.map((part) => {
            const tierId = tierFor(part.id)
            const price = meshPrice(models, tierId)
            return (
              <PartGenerationCard
                key={part.id}
                part={part}
                kind="mesh"
                generationId={part.meshGenerationId}
                mutationError={failures.get(part.id) ?? null}
                action={
                  part.imageGenerationId === null ? (
                    // The honest reason, not a dead control
                    <p className="text-xs text-mist-dim">{t('assets3d.mesh.blocked')}</p>
                  ) : tiers.length === 0 ? (
                    <p className="text-xs text-mist-dim">{t('assets3d.mesh.noTiers')}</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <Select
                        label={t('assets3d.mesh.tier')}
                        options={tiers.map((tier) => ({
                          value: tier.value,
                          label: tier.label,
                          // The price rides IN the row: choosing a tier is
                          // choosing a price, and hiding it until after the
                          // choice makes the picker a trap
                          meta: t('assets3d.price', { credits: tier.credits }),
                        }))}
                        value={tierId}
                        onChange={(value) =>
                          setTierByPart((previous) => new Map(previous).set(part.id, value))
                        }
                      />
                      <Button
                        variant={part.meshGenerationId === null ? 'primary' : 'ghost'}
                        size="sm"
                        // Opens the dialog. It does NOT mutate — that is the
                        // owner's mis-click guarantee, and a test pins it.
                        onClick={() => setPendingPartId(part.id)}
                        disabled={price === null || meshMutation.isPending}
                      >
                        {part.meshGenerationId === null
                          ? t('assets3d.mesh.one')
                          : t('assets3d.mesh.reroll')}{' '}
                        · <PriceTag credits={price} />
                      </Button>
                    </div>
                  )
                }
              />
            )
          })}
        </div>
      </Card>

      {isDone ? (
        <div className="flex flex-wrap items-center justify-end gap-3">
          <p className="text-xs text-glow-green">{t('assets3d.mesh.done')}</p>
          <Button onClick={() => setStageOverride('assembly')}>{t('assets3d.mesh.next')}</Button>
        </div>
      ) : null}

      {/* EVERY mesh passes through here — owner decision, see the file header */}
      <SpendConfirmModal
        isOpen={pendingPart !== null}
        title={t('assets3d.mesh.confirm.title')}
        description={t('assets3d.mesh.confirm.description', {
          name: pendingPart?.name ?? '',
          tier: pendingTierLabel,
          credits: pendingPrice ?? 0,
        })}
        confirmLabel={t('assets3d.mesh.confirm.submit', { credits: pendingPrice ?? 0 })}
        credits={pendingPrice}
        onCancel={() => setPendingPartId(null)}
        onConfirm={confirmMesh}
      />
    </div>
  )
}
