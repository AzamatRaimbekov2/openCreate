// apps/web/src/modules/Assets3D/components/AssetWizard.tsx
// The wizard shell for ONE modular asset (ADR D6). It is STAGE-shaped, not
// page-shaped: there is a single `$assetId` route, and the asset's own state
// decides which of the five acts is on screen — the FilmEditor precedent, where
// one workbench route owns every tool.
//
// Why derived rather than routed: a stage is not a place, it is a description of
// how far the work has got. A `/assets/:id/mesh` URL would be a promise the data
// cannot keep — reload it with nothing extracted and the screen is empty and the
// user reads it as broken. Deriving means the wizard is always truthful about
// where the asset actually is, and the rail (not the URL) offers the detours.
//
// This file owns: the aggregate query and its 4 states, the stage derivation,
// the stage header, and the lazy boundary that keeps three.js out of the main
// chunk. It owns NO stage body except Concept — the four other bodies are
// separate components so this file stays a shell.
import { Suspense, lazy, useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import type { CatalogModel } from '@opencreate/contracts'
import { Card, ErrorState, Skeleton } from 'shared/ui'
import { useAsset } from '../model/asset3dApi'
import { deriveStage } from '../model/wizardStage'
import { useWizardStore } from '../model/wizardStore'
import { ExtractStage } from './ExtractStage'
import { MeshStage } from './MeshStage'
import { PartsStage } from './PartsStage'
import { WizardStageNav } from './WizardStageNav'

// THE VRAM BOUNDARY (ADR D4 → photo-to-3d-studio D6). The entire three.js graph
// hangs off AssemblyStage and nothing else, so `lazy` here is what keeps it in a
// separate chunk. The route itself cannot be `createLazyFileRoute`: Concept,
// Parts, Extraction and Mesh belong in the main bundle — only the viewer is
// heavy enough to pay a network round-trip for.
const AssemblyStage = lazy(() =>
  import('./AssemblyStage').then((m) => ({ default: m.AssemblyStage })),
)

export type AssetWizardProps = {
  // From the route param
  assetId: string
  // The catalog, read by the ROUTE via useCatalog (Assets3D must not import
  // Generator — the route is the seam, exactly as /cinema/$filmId feeds
  // FilmEditor). Empty while it loads: the priced stages then show a skeleton
  // price and DISABLE their buttons rather than quote a number they cannot back.
  models: CatalogModel[]
}

export function AssetWizard({ assetId, models }: AssetWizardProps) {
  const { t } = useTranslation()
  const { data, isPending, isError, refetch } = useAsset(assetId)
  const stageOverride = useWizardStore((state) => state.stageOverride)
  const setStageOverride = useWizardStore((state) => state.setStageOverride)
  const reset = useWizardStore((state) => state.reset)

  // The store is a module SINGLETON and the route param is not: navigating from
  // one asset to another reuses this component, so without an explicit reset the
  // previous asset's selection — or worse, its open spend dialog — would ride
  // along. An effect (not render-time state) because writing to an external
  // store during render is unsafe under concurrent rendering.
  useEffect(() => {
    reset()
  }, [assetId, reset])

  if (isPending) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-8 w-full max-w-xl rounded-full" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    )
  }

  // 404 / foreign asset / network: one calm localized sentence, never the raw
  // envelope. Retry is offered because a transient failure is the common case.
  if (isError) {
    return <ErrorState message={t('assets3d.wizard.notFound')} onRetry={() => void refetch()} />
  }

  const { asset, parts } = data
  // `reached` = where the DATA says the asset is; `stage` = what the user is
  // looking at. They differ exactly while a back-nav override is set, and the
  // rail needs both (see WizardStageNav on why one prop would not do).
  const reached = deriveStage(asset, parts)
  const stage = deriveStage(asset, parts, stageOverride)

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center gap-3">
        <Link
          to="/assets"
          className="rounded-lg px-1 text-sm text-portal underline decoration-portal/40 underline-offset-4 hover:decoration-portal focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
        >
          {t('assets3d.wizard.back')}
        </Link>
        <h1 className="text-3xl font-normal text-white">{asset.title}</h1>
      </header>

      <WizardStageNav active={stage} reached={reached} onSelect={setStageOverride} />

      {/* The stage HEADER lives here, not in the stage bodies: it is the same
          two lines for all five acts, and owning it centrally means a body can
          be swapped (or lazily loaded) without the page losing its heading. */}
      <section aria-labelledby="wizard-stage-heading" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="wizard-stage-heading" className="text-xl font-normal text-white">
            {t(`assets3d.stage.${stage}`)}
          </h2>
          <p className="text-sm text-mist-dim">{t(`assets3d.${stage}.description`)}</p>
        </div>

        {stage === 'upload' ? (
          // The Concept act has no work to do — the image was uploaded at create
          // time. It exists so the rail has a first step and so the user can come
          // back and LOOK at what every extraction is being derived from.
          <Card surface="well" padding="none" className="overflow-hidden">
            <img
              src={asset.conceptImageUrl}
              alt={t('assets3d.wizard.conceptAlt', { title: asset.title })}
              className="max-h-[60svh] w-full object-contain"
            />
          </Card>
        ) : stage === 'assembly' ? (
          // Suspense fallback is shape-matched to the viewer plate, so the lazy
          // chunk's arrival does not jump the layout
          <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
            <AssemblyStage assetId={assetId} parts={parts} />
          </Suspense>
        ) : stage === 'extract' ? (
          // The catalog seam, live: extraction is priced per part off the SAME
          // models the route handed down. An empty catalog is a first-class
          // DISABLED state inside the stage, not an error — the price pulses and
          // the buttons stay off rather than quoting a number nothing backs.
          <ExtractStage assetId={assetId} parts={parts} models={models} />
        ) : stage === 'mesh' ? (
          <MeshStage assetId={assetId} parts={parts} models={models} />
        ) : (
          // Parts is FREE, but it still receives `models`: it PRINTS the
          // extraction price beside the CTA that walks the user into the paid
          // half, so the first time they see a number is not the moment it is
          // already being charged.
          <PartsStage assetId={assetId} parts={parts} models={models} />
        )}
      </section>
    </div>
  )
}
