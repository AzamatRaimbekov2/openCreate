// apps/web/src/routes/_shell.shorts.index.tsx
// Shorts Studio screen ('/shorts') — the BATCH surface, not a second gallery.
// Auth-guarded like /templates and /cinema. Composition only: the Shorts module
// owns the variants table, the itemised confirm, the runner and the board.
//
// ADR: docs/wiki/decisions/shorts-studio.md
//
// TWO THINGS THIS ROUTE DOES THAT THE MODULE DELIBERATELY DOES NOT:
//
//   1. It reads the CATALOG (useCatalog, from modules/Generator) and hands it
//      down as `models`. This is the established seam — /create, /cinema and
//      /assets all do it — and it is why the Shorts module never fetches a
//      price list of its own.
//
//   2. It owns the BATCH ID, in the URL. That is the whole of the ADR's reload
//      story (§2: "a batch survives a reload because it was never in memory to
//      begin with"). The board is rebuilt from `?batch=…` plus the shared
//      ['generation', id] cache, so closing the tab loses nothing that was
//      already submitted — every one of those rows exists server-side and
//      settles on the next visit.
//      `replace: true` on the write: creating a batch is not a navigation the
//      back button should have to step through.
import { createFileRoute } from '@tanstack/react-router'
import { requireSession } from 'modules/Auth'
import { useCatalog } from 'modules/Generator'
import { ShortsStudio } from 'modules/Shorts'

// The one search param this screen carries. Hand-written rather than schema'd
// because it is a single optional opaque id: anything that is not a non-empty
// string is simply "no batch", which is also the honest reading of a URL someone
// truncated.
type ShortsSearch = { batch?: string }

export const Route = createFileRoute('/_shell/shorts/')({
  validateSearch: (search: Record<string, unknown>): ShortsSearch => {
    const batch = search['batch']
    return typeof batch === 'string' && batch.length > 0 ? { batch } : {}
  },
  beforeLoad: () => requireSession(),
  component: ShortsPage,
})

function ShortsPage() {
  const { batch } = Route.useSearch()
  const navigate = Route.useNavigate()
  const catalog = useCatalog()

  return (
    <main className="flex w-full flex-col gap-8 px-6 py-8 xl:px-10">
      <ShortsStudio
        // Empty while the catalog loads. The studio reads that as "no price
        // yet" and disables the run — never as "free".
        models={catalog.data?.models ?? []}
        batchId={batch ?? null}
        onBatchCreated={(batchId) =>
          void navigate({ search: { batch: batchId }, replace: true })
        }
      />
    </main>
  )
}
