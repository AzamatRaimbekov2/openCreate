// apps/web/src/routes/_shell.entities.tsx
// Entities screen ('/entities') — the reusable character/object/place library.
// Auth-guarded (beforeLoad bounces signed-out visitors). Composition only: the
// Entities module owns the list, editor and mutations; the route only lays out
// the full-bleed canvas, matching /library and /create.
import { createFileRoute } from '@tanstack/react-router'
import { requireSession } from 'modules/Auth'
import { EntityLibrary } from 'modules/Entities'

export const Route = createFileRoute('/_shell/entities')({
  beforeLoad: () => requireSession(),
  component: EntitiesPage,
})

function EntitiesPage() {
  return (
    <main className="flex w-full flex-col gap-8 px-6 py-8 xl:px-10">
      <EntityLibrary />
    </main>
  )
}
