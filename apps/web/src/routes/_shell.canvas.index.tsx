// apps/web/src/routes/_shell.canvas.index.tsx
// Canvas list screen ('/canvas', inside the AppShell) — the /cinema list
// pattern. Auth-guarded: beforeLoad bounces signed-out visitors before any
// private UI mounts. Composition only; the Canvas module owns the list, the
// create mutation and every state it renders.
import { createFileRoute } from '@tanstack/react-router'
import { requireSession } from 'modules/Auth'
import { CanvasLibrary } from 'modules/Canvas'

export const Route = createFileRoute('/_shell/canvas/')({
  beforeLoad: () => requireSession(),
  component: CanvasIndexPage,
})

function CanvasIndexPage() {
  return (
    <main className="flex w-full flex-col gap-8 px-6 py-8 xl:px-10">
      <CanvasLibrary />
    </main>
  )
}
