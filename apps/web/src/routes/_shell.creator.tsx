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
// h-[calc(100dvh-4rem)] is the /create precedent. `dvh` not `vh`: mobile
// Safari's vh includes the retracted URL bar. The height is FIXED rather than
// grown by content on purpose — that is what makes the transcript its own
// scroller and keeps the composer pinned while the conversation scrolls behind
// it. A `min-h` version would let the PAGE scroll instead, and a chat whose
// input you have to scroll down to reach is not a chat.
//
// About the 4rem: the compact v3.1 header is actually 44px (py-1.5 + a 32px
// control row), so this over-subtracts by ~20px and leaves a small gap under the
// composer. That is deliberate — it matches /create, and it errs in the safe
// direction. Tightening it to 2.75rem would buy those 20px and risk pushing the
// composer under the fold the moment the header's own `flex-wrap` takes a second
// row. Known caveat either way: on a viewport narrow enough to wrap the ten nav
// links, a fixed-height page cannot scroll to reveal what the taller header
// pushed down — the same caveat /create carries.
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
