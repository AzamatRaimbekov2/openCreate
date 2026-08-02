// apps/web/src/routes/cinema.$filmId.tsx
// CinemaStudio editor screen ('/cinema/:filmId'). Auth-guarded. This route lives
// OUTSIDE the global `_shell` AppShell (owner request 2026-07-23: "раздел кино
// совершенно другой должен быть, пусть тут свой хедер будет"): the editor renders
// its OWN full-bleed top bar (modules/Cinema/CinemaEditorHeader, via FilmEditor)
// INSTEAD of the app-wide nav. Two jobs live here, both the composition seam a
// route is allowed to be:
//   1. Cross-module SEAMS — Cinema must not import Generator/Templates/Entities,
//      so the catalog (video/audio model pickers), the template list (the music
//      bed a format wants) and the character library (cast tags) are read HERE
//      and handed to FilmEditor. Unchanged from when this route sat under _shell.
//   2. GLOBAL CHROME — because this screen dropped AppShell, the balance · lang ·
//      account cluster the editor bar needs is composed here (routes MAY import
//      modules/Auth + modules/Credits; shared/ui and modules/Cinema may NOT) and
//      passed to FilmEditor as the `chrome` slot — the exact injection pattern
//      routes/_shell.tsx used to feed AppShell.
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { requireSession, signOut, useAuthSession } from 'modules/Auth'
import { FilmEditor } from 'modules/Cinema'
import { BalanceChip } from 'modules/Credits'
import { useEntities } from 'modules/Entities'
import { useCatalog } from 'modules/Generator'
import { useStyles } from 'modules/Styles'
import { useTemplates } from 'modules/Templates'
import { AccountMenu, LangSwitch } from 'shared/ui'

export const Route = createFileRoute('/cinema/$filmId')({
  beforeLoad: () => requireSession(),
  component: FilmEditorPage,
})

function FilmEditorPage() {
  const { filmId } = Route.useParams()
  // Same ['catalog'] cache entry the composer uses — one fetch per session.
  const catalog = useCatalog()
  // A film made from a template carries its templateId; the template knows the
  // music the format wants, which pre-fills the audio panel. Cached staleTime:
  // Infinity, so this is shared with /templates and costs nothing on revisit.
  const templates = useTemplates()
  // A shot's CAST is what makes a film hold together. id+name+thumbnail travel:
  // the inspector shows a name and sends an id, and its inline "@" picker shows
  // the character's primary reference photo (the face IS the row's meaning when
  // the user is tagging "photos") — same derivation as routes/_shell.create.tsx.
  const entities = useEntities()
  // The style registry (ADR style-studio D5): builtin styles and the ones this
  // user wrote, unioned server-side. Read HERE for the same reason the catalog
  // is — Cinema must not import modules/Styles — and handed to FilmEditor, which
  // fans it out to all three style pickers on this screen (shot inspector,
  // storyboard, film default). Same ['styles'] cache entry the /styles page
  // fills, so arriving from there costs no request.
  const styles = useStyles()
  const castableEntities = (entities.data?.items ?? []).map((e) => ({
    id: e.id,
    name: e.name,
    imageUrl: e.images.find((image) => image.id === e.primaryImageId)?.url ?? e.images[0]?.url ?? null,
  }))

  // GLOBAL CHROME — composed here because the editor dropped AppShell. Mirrors
  // routes/_shell.tsx: normalize better-auth's optional name to the shell's null
  // contract, drop the whole personal cache on sign-out (me/generations/txns must
  // not outlive the account), then land on the public home.
  const session = useAuthSession()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = session.data
    ? { name: session.data.user.name ?? null, email: session.data.user.email }
    : null
  const handleSignOut = () => {
    void signOut().then(() => {
      queryClient.clear()
      void navigate({ to: '/' })
    })
  }
  const chrome = (
    <>
      {/* No chip when signed out — avoids a guaranteed-401 /api/me request */}
      {user ? <BalanceChip /> : null}
      <LangSwitch />
      <AccountMenu user={user} isSessionPending={session.isPending} onSignOut={handleSignOut} />
    </>
  )

  return (
    // The editor's OWN full-height column on the void: the top bar + the
    // workbench fill it exactly (no page scroll — FilmEditor owns the math).
    <div className="flex min-h-svh flex-col bg-void">
      <FilmEditor
        filmId={filmId}
        models={catalog.data?.models ?? []}
        templates={templates.data?.items ?? []}
        entities={castableEntities}
        styles={styles.data?.items ?? []}
        chrome={chrome}
      />
    </div>
  )
}
