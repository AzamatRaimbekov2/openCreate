// apps/web/src/routes/_shell.cinema.$filmId.tsx
// CinemaStudio editor screen ('/cinema/:filmId'). Auth-guarded. Composition +
// the cross-module SEAM: the Cinema module must not import Generator, so the
// catalog (needed for the shot's video-model picker and the audio-track models)
// is read HERE via the Generator's public useCatalog and passed into FilmEditor
// as `models` — exactly the pattern /create uses to feed Gallery/Generator.
import { createFileRoute } from '@tanstack/react-router'
import { requireSession } from 'modules/Auth'
import { FilmEditor } from 'modules/Cinema'
import { useCatalog } from 'modules/Generator'
import { useTemplates } from 'modules/Templates'

export const Route = createFileRoute('/_shell/cinema/$filmId')({
  beforeLoad: () => requireSession(),
  component: FilmEditorPage,
})

function FilmEditorPage() {
  const { filmId } = Route.useParams()
  // Same ['catalog'] cache entry the composer uses — one fetch per session.
  // Empty until it lands; the model pickers then show a placeholder + disabled
  // Generate, and fill in when the catalog resolves.
  const catalog = useCatalog()
  // The SECOND cross-module seam, same shape as the first. A film made from a
  // template carries its templateId, and the template knows what music the format
  // wants — which pre-fills the audio panel. Cinema must not import Templates, so
  // the list is read here and handed down; FilmEditor does the lookup because it
  // is the one that loads the film. Cached with staleTime: Infinity, so this is
  // shared with /templates and costs nothing on a second visit.
  const templates = useTemplates()

  return (
    <main className="flex w-full flex-col gap-8 px-6 py-8 xl:px-10">
      <FilmEditor
        filmId={filmId}
        models={catalog.data?.models ?? []}
        templates={templates.data?.items ?? []}
      />
    </main>
  )
}
