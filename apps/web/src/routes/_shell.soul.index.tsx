// apps/web/src/routes/_shell.soul.index.tsx
// AI Soul Studio ('/soul') — a 3-ZONE STUDIO (recomposed 2026-07-21): build a
// character in the right Builder, watch the live draft on the center Stage, pick
// from your rail on the left, and create it from the fixed bottom composer dock.
// Auth-guarded. Composition only: the Soul module owns the draft, the pickers and
// the mutation; the route owns the workbench canvas.
//
// TIGHTER CANVAS than the browsing screens (the /cinema/$filmId workbench
// posture): `px-4 py-4 xl:px-6`, whose 16px vertical padding + the 44px app bar
// is exactly the `100svh-76px` the studio column subtracts — the studio locks the
// viewport and scrolls its zones internally instead of scrolling the page.
//
// No catalog is read here: NOTHING on this screen costs credits. The prices (and
// therefore the catalog) live on the soul card, where the paid actions are.
import { createFileRoute } from '@tanstack/react-router'
import { requireSession } from 'modules/Auth'
import { SoulStudio } from 'modules/Soul'

export const Route = createFileRoute('/_shell/soul/')({
  beforeLoad: () => requireSession(),
  component: SoulStudioPage,
})

function SoulStudioPage() {
  return (
    <main className="flex w-full flex-col gap-4 px-4 py-4 xl:px-6">
      <SoulStudio />
    </main>
  )
}
