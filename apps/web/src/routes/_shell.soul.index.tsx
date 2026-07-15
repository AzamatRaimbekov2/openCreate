// apps/web/src/routes/_shell.soul.index.tsx
// AI Soul Studio ('/soul') — build a character from the constructor, start from a
// ready-made one, or open one you already made. Auth-guarded. Composition only:
// the Soul module owns the draft, the pickers and the mutations; the route owns
// the full-bleed canvas, matching /create, /library and /entities.
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
    <main className="flex w-full flex-col gap-8 px-6 py-8 xl:px-10">
      <SoulStudio />
    </main>
  )
}
