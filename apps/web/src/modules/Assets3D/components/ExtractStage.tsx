// apps/web/src/modules/Assets3D/components/ExtractStage.tsx
// The first paid stage: every part is redrawn on its own, isolated, so it can be
// meshed. One image per part, one charge per image.
//
// THE SPEND SHAPE HERE (owner decision 2026-07-20, plan Fix FG-4):
//   · a SINGLE part extracts on the click. The price is printed on the button
//     before it, but there is no per-click dialog — extraction is the cheap,
//     high-repetition step, and a modal in front of each of twelve parts would
//     make the grid unusable, which is its own kind of money bug (users batch
//     blindly to escape the friction).
//   · the BATCH is gated. "Extract all" can move twelve parts' worth of credits
//     in one gesture, so it goes through SpendConfirmModal, which restates the
//     TOTAL. The confirm handler closes the dialog FIRST and then mutates: the
//     interesting thing to watch is the grid filling in, not a spinner on a
//     question already answered.
//
// A per-part failure never aborts its siblings. Each part is its own mutation
// call, so one rejection leaves the rest in flight, and a generation that failed
// upstream shows its own localized reason and refund chip on its own plate
// (PartGenerationCard). Collapsing twelve outcomes into one banner would hide
// exactly which of them the user actually got for their credits.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Asset3dPart, CatalogModel } from '@opencreate/contracts'
import { ApiClientError } from 'shared/libs/apiClient'
import { errorCodeMessageKey } from 'shared/libs/errorCopy'
import { Button, Card, EmptyState } from 'shared/ui'
import { useExtractPart } from '../model/asset3dApi'
import { extractionPrice } from '../model/assetPricing'
import { useWizardStore } from '../model/wizardStore'
import { PartGenerationCard } from './PartGenerationCard'
import { PriceTag } from './PriceTag'
import { SpendConfirmModal } from './SpendConfirmModal'

export type ExtractStageProps = {
  // The asset being extracted
  assetId: string
  // Its parts, from the wizard's aggregate (this stage never fetches the asset)
  parts: Asset3dPart[]
  // The live catalog — the source of the per-part price. Empty while it loads:
  // the buttons then pulse and stay DISABLED rather than quote a guess.
  models: CatalogModel[]
}

export function ExtractStage({ assetId, parts, models }: ExtractStageProps) {
  const { t } = useTranslation()
  const extractMutation = useExtractPart()
  const pendingExtractIds = useWizardStore((state) => state.pendingExtractIds)
  const requestExtract = useWizardStore((state) => state.requestExtract)
  const cancelExtract = useWizardStore((state) => state.cancelExtract)
  const setStageOverride = useWizardStore((state) => state.setStageOverride)

  // Per-part mutation rejections from the last attempt. A Map keyed by part id
  // because the whole point is that these are INDEPENDENT — a shared "error"
  // string would let one part's rejection paint over eleven healthy plates.
  const [failures, setFailures] = useState<Map<string, string>>(new Map())

  const unitPrice = extractionPrice(models)
  // Parts still worth paying for: never extracted, or extracted and being
  // re-rolled is a per-part act, so the BATCH only offers the untouched ones.
  const unextracted = parts.filter((part) => part.imageGenerationId === null)
  const batchPrice = unitPrice === null ? null : unitPrice * (pendingExtractIds?.length ?? 0)
  const isDone = parts.length > 0 && unextracted.length === 0

  // One call per part, fired independently. `onError` records the reason against
  // that part alone; siblings are untouched — that IS the "does not abort the
  // batch" requirement, expressed as N calls rather than one transaction.
  const extractParts = (partIds: string[]) => {
    setFailures(new Map())
    partIds.forEach((partId) => {
      extractMutation.mutate(
        { assetId, partId },
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
    })
  }

  const confirmBatch = () => {
    if (pendingExtractIds === null) return
    const partIds = pendingExtractIds
    // Close FIRST, then spend (design.md §9)
    cancelExtract()
    extractParts(partIds)
  }

  if (parts.length === 0) {
    return (
      <EmptyState
        title={t('assets3d.extract.empty.title')}
        description={t('assets3d.extract.empty.description')}
        action={
          <Button variant="ghost" onClick={() => setStageOverride('parts')}>
            {t('assets3d.stage.parts')}
          </Button>
        }
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card padding="lg">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {parts.map((part) => (
            <PartGenerationCard
              key={part.id}
              part={part}
              kind="extract"
              generationId={part.imageGenerationId}
              mutationError={failures.get(part.id) ?? null}
              action={
                <Button
                  variant={part.imageGenerationId === null ? 'primary' : 'ghost'}
                  size="sm"
                  // Click-to-spend by owner decision — see the file header
                  onClick={() => extractParts([part.id])}
                  disabled={unitPrice === null || extractMutation.isPending}
                >
                  {part.imageGenerationId === null
                    ? t('assets3d.extract.one')
                    : t('assets3d.extract.reroll')}{' '}
                  · <PriceTag credits={unitPrice} />
                </Button>
              }
            />
          ))}
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {isDone ? (
          <>
            <p className="text-xs text-glow-green">{t('assets3d.extract.done')}</p>
            <Button onClick={() => setStageOverride('mesh')}>{t('assets3d.extract.next')}</Button>
          </>
        ) : (
          <Button
            variant="ghost"
            onClick={() => requestExtract(unextracted.map((part) => part.id))}
            disabled={unitPrice === null || unextracted.length === 0}
          >
            {t('assets3d.extract.all')}
          </Button>
        )}
      </div>

      {/* Money is never moved in one gesture at BATCH scale (design.md §9) */}
      <SpendConfirmModal
        isOpen={pendingExtractIds !== null}
        title={t('assets3d.extract.confirm.title')}
        description={t('assets3d.extract.confirm.description', {
          parts: pendingExtractIds?.length ?? 0,
          credits: batchPrice ?? 0,
        })}
        confirmLabel={t('assets3d.extract.confirm.submit', { credits: batchPrice ?? 0 })}
        credits={batchPrice}
        onCancel={cancelExtract}
        onConfirm={confirmBatch}
      />
    </div>
  )
}
