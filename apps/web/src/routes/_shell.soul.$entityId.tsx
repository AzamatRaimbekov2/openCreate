// apps/web/src/routes/_shell.soul.$entityId.tsx
// The soul card ('/soul/:entityId') — the reference sheet, the characteristics,
// and the paid actions. Auth-guarded. Composition + the cross-module SEAM: the
// Soul module must not import Generator, so the catalog (which is where the
// portrait and video PRICES come from) is read HERE via the Generator's public
// useCatalog and passed into SoulCard as `models` — exactly what
// /cinema/$filmId does for FilmEditor.
import { createFileRoute } from '@tanstack/react-router'
import { requireSession } from 'modules/Auth'
import { useCatalog } from 'modules/Generator'
import { SoulCard } from 'modules/Soul'

export const Route = createFileRoute('/_shell/soul/$entityId')({
  beforeLoad: () => requireSession(),
  component: SoulCardPage,
})

function SoulCardPage() {
  const { entityId } = Route.useParams()
  // The SAME ['catalog'] cache entry the composer uses — one fetch per session.
  // Empty until it lands, and an empty catalog means "price unknown": the mint
  // buttons stay disabled rather than quote a number they cannot back up.
  const catalog = useCatalog()

  return (
    <main className="flex w-full flex-col gap-8 px-6 py-8 xl:px-10">
      <SoulCard entityId={entityId} models={catalog.data?.models ?? []} />
    </main>
  )
}
