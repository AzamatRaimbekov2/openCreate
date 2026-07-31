// apps/web/src/routes/_shell.cinema.index.tsx
// CinemaStudio library screen ('/cinema') — the film list. Auth-guarded
// (beforeLoad bounces signed-out visitors, like /entities). Composition only:
// the Cinema module owns the list, the New-film modal and every mutation; this
// route lays out the full-bleed canvas, matching /library and /entities.
import { createFileRoute } from '@tanstack/react-router'
import { requireSession } from 'modules/Auth'
import { CinemaLibrary } from 'modules/Cinema'
import { useStyles } from 'modules/Styles'

export const Route = createFileRoute('/_shell/cinema/')({
  beforeLoad: () => requireSession(),
  component: CinemaPage,
})

function CinemaPage() {
  // The style registry, read here and handed down: the New-film modal picks the
  // film's DEFAULT style, and since ADR style-studio D5 that list includes the
  // styles the user wrote. Cinema must not import modules/Styles, so the route is
  // the seam — the same one cinema.$filmId uses for the catalog and the cast.
  const styles = useStyles()
  return (
    <main className="flex w-full flex-col gap-8 px-6 py-8 xl:px-10">
      <CinemaLibrary styles={styles.data?.items ?? []} />
    </main>
  )
}
