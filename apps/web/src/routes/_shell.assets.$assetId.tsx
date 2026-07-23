// apps/web/src/routes/_shell.assets.$assetId.tsx
// Modular 3D Assets wizard screen ('/assets/:assetId'). Auth-guarded.
// Composition + the cross-module SEAM: the Assets3D module must not import
// Generator, so the catalog — which is where the extraction and mesh-tier PRICES
// come from — is read HERE via the Generator's public useCatalog and passed into
// AssetWizard as `models`. Exactly what /cinema/$filmId and /soul/$entityId do.
//
// The route deliberately does NOT load the asset aggregate: the wizard owns
// `useAsset` because it is the thing that renders all four of its states.
import { createFileRoute } from '@tanstack/react-router'
import { requireSession } from 'modules/Auth'
import { AssetWizard } from 'modules/Assets3D'
import { useCatalog } from 'modules/Generator'

export const Route = createFileRoute('/_shell/assets/$assetId')({
  beforeLoad: () => requireSession(),
  component: AssetWizardPage,
})

function AssetWizardPage() {
  const { assetId } = Route.useParams()
  // The SAME ['catalog'] cache entry the composer uses — one fetch per session.
  // Empty until it lands, and an empty catalog means "price unknown": the paid
  // stages pulse a skeleton price and stay disabled rather than quote a number
  // they cannot back up. That is a normal state here, never an error.
  const catalog = useCatalog()

  return (
    // Tighter canvas than the browsing screens: the wizard is a workbench, and
    // its chrome budget goes to the stage (the /cinema/$filmId posture)
    <main className="flex w-full flex-col gap-4 px-4 py-4 xl:px-6">
      <AssetWizard assetId={assetId} models={catalog.data?.models ?? []} />
    </main>
  )
}
