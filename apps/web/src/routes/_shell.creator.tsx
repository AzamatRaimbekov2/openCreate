// apps/web/src/routes/_shell.creator.tsx
// openCreator ('/creator', inside the AppShell chrome): the agent chat that
// writes a scenario, builds a character, assembles a canvas and — after ONE
// budget confirmation — runs the generations itself (ADR opencreator-agent).
// Auth-guarded: beforeLoad bounces signed-out visitors before any private UI
// mounts, like every other in-app screen.
//
// Composition only. The screen's two decisions (which conversation is open, and
// whether a message opens a session or continues one) live in
// modules/Creator/CreatorWorkbench — a route must hold no business logic.
//
// h-[calc(100dvh-4rem)] is the /create precedent: 4rem is the AppShell header,
// and dvh (not vh) because mobile Safari's vh includes the retracted URL bar,
// which would push the composer below the fold. The height is fixed rather than
// grown by content because the transcript is its OWN scroller — the composer
// must stay pinned at the bottom while the conversation scrolls behind it.
import { createFileRoute } from '@tanstack/react-router'
import { requireSession } from 'modules/Auth'
import { CreatorWorkbench } from 'modules/Creator'

export const Route = createFileRoute('/_shell/creator')({
  beforeLoad: () => requireSession(),
  component: CreatorPage,
})

// NOT exported: route files may only export Route, or the router plugin cannot
// code-split the screen.
function CreatorPage() {
  return (
    <main className="flex h-[calc(100dvh-4rem)] w-full flex-col overflow-hidden px-6 py-6 xl:px-10">
      <CreatorWorkbench />
    </main>
  )
}
