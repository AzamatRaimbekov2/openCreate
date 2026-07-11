// apps/web/src/modules/Templates/components/TemplateCatalog.tsx
// The /templates page body: the gallery of ready-made formats.
//
// ADR: docs/wiki/decisions/template-catalog.md
//
// Full 4-states (loading skeletons → error+retry → empty → grid), like every
// other list surface in the app.
//
// The empty state is worth a note: it should be UNREACHABLE — the catalog is a
// server-side constant, so "no templates" means an API deploy shipped an empty
// registry. It is rendered honestly rather than as a crash, but it is a bug
// report, not a user's normal path.
//
// Shelves: templates are grouped by category, each with its own heading. With one
// category ('brainrot') this looks like overhead — it is not. The whole point of
// the module is that it grows, and a flat grid of forty templates is a wall. The
// grouping is here from the start so adding the second shelf is data, not a
// rewrite. The heading is skipped when there is only one shelf: a lone "Брейнрот"
// header above every card on the page is noise.
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TemplateCategory, TemplateSummary } from '@opencreate/contracts'
import { EmptyState, ErrorState, Skeleton } from 'shared/ui'
import { useTemplates } from '../model/templatesApi'
import { TemplateCard } from './TemplateCard'
import { TemplateDetailModal } from './TemplateDetailModal'

const SKELETON_KEYS = ['s1', 's2', 's3', 's4']
const GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4'

export function TemplateCatalog() {
  const { t } = useTranslation()
  const { data, isPending, isError, refetch } = useTemplates()
  const [openTemplate, setOpenTemplate] = useState<TemplateSummary | null>(null)

  // Preserve the API's order within each shelf — it is curated (the dramas lead
  // because they are why anyone opens this page).
  const shelves = useMemo(() => {
    const byCategory = new Map<TemplateCategory, TemplateSummary[]>()
    for (const template of data?.items ?? []) {
      const shelf = byCategory.get(template.category) ?? []
      shelf.push(template)
      byCategory.set(template.category, shelf)
    }
    return [...byCategory.entries()]
  }, [data])

  if (isPending) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-9 w-64" />
        <div className={GRID}>
          {SKELETON_KEYS.map((key) => (
            <div key={key} className="flex flex-col gap-3">
              {/* The 4:5 plate + its caption row — the grid must not reflow when
                  the real cards land. */}
              <Skeleton className="aspect-4/5 w-full" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (isError) {
    return <ErrorState message={t('errors.loadFailed')} onRetry={() => void refetch()} />
  }

  if (data.items.length === 0) {
    return <EmptyState title={t('templates.empty.title')} description={t('templates.empty.description')} />
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-normal text-white">{t('templates.title')}</h1>
        <p className="max-w-2xl text-sm text-mist-dim">{t('templates.subtitle')}</p>
      </div>

      {shelves.map(([category, templates]) => (
        <section key={category} className="flex flex-col gap-4">
          {shelves.length > 1 ? (
            <h2 className="text-sm font-normal text-mist-dim">
              {t(`templates.category.${category}`)}
            </h2>
          ) : null}
          <ul className={GRID}>
            {templates.map((template) => (
              <li key={template.id}>
                <TemplateCard template={template} onOpen={setOpenTemplate} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {/* Keyed by id so opening a different template re-initialises the form
          draft — the same no-useEffect-sync discipline as ShotInspector. */}
      <TemplateDetailModal
        key={openTemplate?.id ?? 'none'}
        template={openTemplate}
        onClose={() => setOpenTemplate(null)}
      />
    </div>
  )
}
