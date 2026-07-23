// apps/web/src/routes/_shell.assets.index.tsx
// Modular 3D Assets library screen ('/assets') — the asset list. Auth-guarded
// (beforeLoad bounces signed-out visitors, like /cinema and /entities).
// Composition only: the Assets3D module owns the list, the create modal and
// every mutation; this route lays out the full-bleed canvas, matching /cinema.
import { createFileRoute } from '@tanstack/react-router'
import { requireSession } from 'modules/Auth'
import { AssetLibrary } from 'modules/Assets3D'

export const Route = createFileRoute('/_shell/assets/')({
  beforeLoad: () => requireSession(),
  component: AssetsPage,
})

function AssetsPage() {
  return (
    <main className="flex w-full flex-col gap-8 px-6 py-8 xl:px-10">
      <AssetLibrary />
    </main>
  )
}
