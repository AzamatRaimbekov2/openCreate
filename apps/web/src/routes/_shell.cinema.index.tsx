// apps/web/src/routes/_shell.cinema.index.tsx
// CinemaStudio library screen ('/cinema') — the film list. Auth-guarded
// (beforeLoad bounces signed-out visitors, like /entities). Composition only:
// the Cinema module owns the list, the New-film modal and every mutation; this
// route lays out the full-bleed canvas, matching /library and /entities.
import { createFileRoute } from '@tanstack/react-router'
import { requireSession } from 'modules/Auth'
import { CinemaLibrary } from 'modules/Cinema'

export const Route = createFileRoute('/_shell/cinema/')({
  beforeLoad: () => requireSession(),
  component: CinemaPage,
})

function CinemaPage() {
  // No style seam here any more. This route used to read the registry for the
  // New-film modal's default-style picker; create mode no longer poses that
  // question (owner request 2026-07-31), so the read went with it rather than
  // fetching a list nobody renders. The seam itself is alive and well in
  // cinema.$filmId, which still feeds the editor's three style pickers.
  return (
    <main className="flex w-full flex-col gap-8 px-6 py-8 xl:px-10">
      <CinemaLibrary />
    </main>
  )
}
