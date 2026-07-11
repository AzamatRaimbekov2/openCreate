// apps/web/src/routes/_shell.templates.index.tsx
// Template catalog screen ('/templates') — the gallery of ready-made viral
// formats. Auth-guarded (beforeLoad bounces signed-out visitors, like /cinema and
// /entities). Composition only: the Templates module owns the grid, the detail
// sheet, and the instantiate mutation; this route lays out the full-bleed canvas.
import { createFileRoute } from '@tanstack/react-router'
import { requireSession } from 'modules/Auth'
import { TemplateCatalog } from 'modules/Templates'

export const Route = createFileRoute('/_shell/templates/')({
  beforeLoad: () => requireSession(),
  component: TemplatesPage,
})

function TemplatesPage() {
  return (
    <main className="flex w-full flex-col gap-8 px-6 py-8 xl:px-10">
      <TemplateCatalog />
    </main>
  )
}
