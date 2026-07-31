// apps/web/src/routes/_shell.styles.tsx
// Styles screen ('/styles') — the style constructor and library. Auth-guarded
// (beforeLoad bounces signed-out visitors, like /entities). Composition only:
// the Styles module owns the list, the editor and every mutation.
//
// The one piece of wiring that belongs HERE is the catalog: the style editor
// needs it to offer a recommended model and to price the preview button, and
// modules/Styles must not import modules/Generator. Same cross-module seam
// routes/cinema.$filmId.tsx uses for catalog/templates/entities.
import { createFileRoute } from '@tanstack/react-router'
import { requireSession } from 'modules/Auth'
import { useCatalog } from 'modules/Generator'
import { StyleLibrary } from 'modules/Styles'

export const Route = createFileRoute('/_shell/styles')({
  beforeLoad: () => requireSession(),
  component: StylesPage,
})

function StylesPage() {
  // Same ['catalog'] cache entry the composer uses — one fetch per session.
  const catalog = useCatalog()
  return (
    <main className="flex w-full flex-col gap-8 px-6 py-8 xl:px-10">
      <StyleLibrary models={catalog.data?.models ?? []} />
    </main>
  )
}
