// apps/web/src/routes/canvas.$canvasId.tsx
// Full-viewport canvas editor — the cinema.$filmId pattern: a FLAT filename
// puts it OUTSIDE `_shell`, so the board owns the whole viewport and this
// route assembles its own chrome. Two jobs live here, both the composition
// seam a route is allowed to be:
//   1. Cross-module SEAMS — modules/Canvas must not import modules/Generator,
//      so the model catalog is read HERE and handed down as node data.
//   2. GLOBAL CHROME — with no AppShell, the balance chip the editor bar needs
//      is composed here (routes MAY import modules/Credits; the module may not).
// It also owns the per-document lifecycle: init the store when the document
// lands, reset it on the way out.
import { useEffect } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { requireSession } from 'modules/Auth'
import { BalanceChip } from 'modules/Credits'
import { useCatalog } from 'modules/Generator'
import {
  CanvasEditor,
  retrySave,
  useCanvasAutosave,
  useCanvasDetail,
  useCanvasStore,
  type CanvasModelOption,
} from 'modules/Canvas'
import { ErrorState, Skeleton } from 'shared/ui'

export const Route = createFileRoute('/canvas/$canvasId')({
  beforeLoad: () => requireSession(),
  component: CanvasEditorPage,
})

function CanvasEditorPage() {
  const { t } = useTranslation()
  const { canvasId } = Route.useParams()
  const doc = useCanvasDetail(canvasId)
  // The SAME ['catalog'] cache entry the composer uses — one fetch per session.
  const catalog = useCatalog()
  const title = useCanvasStore((s) => s.title)
  const saveState = useCanvasStore((s) => s.saveState)
  const setTitle = useCanvasStore((s) => s.setTitle)
  // The board mounts only once the store holds THIS document: React Flow reads
  // the saved camera as its defaultViewport at mount, and rendering earlier
  // would freeze the camera at 0,0,1 and flash the previous canvas's nodes.
  const isLoaded = useCanvasStore((s) => s.canvasId === canvasId)

  // Per-document lifecycle (the wizardStore discipline — singleton store, so
  // the route is what keeps one canvas from leaking into the next).
  useEffect(() => {
    if (doc.data) useCanvasStore.getState().init(doc.data)
    return () => useCanvasStore.getState().reset()
  }, [doc.data])
  useCanvasAutosave()

  // Catalog → node data. Video models price per duration, so the whole table
  // travels: the node prices the run at the duration the user picked.
  const models: CanvasModelOption[] = (catalog.data?.models ?? []).flatMap((m) =>
    m.type === 'image' || m.type === 'video'
      ? [
          {
            id: m.id,
            name: m.name,
            providerLabel: m.providerLabel,
            type: m.type,
            credits:
              m.type === 'image' ? m.credits : (Object.values(m.creditsByDuration)[0] ?? 0),
            aspectRatios: m.aspectRatios,
            ...(m.type === 'video'
              ? { durationOptions: m.durationOptions, creditsByDuration: m.creditsByDuration }
              : {}),
          },
        ]
      : [],
  )

  return (
    // The editor's own full-height column on the void: header + board fill it
    // exactly, and the page itself never scrolls (the board pans instead).
    <div className="flex h-svh flex-col bg-void">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-white/10 px-4">
        <Link
          to="/canvas"
          className="shrink-0 rounded text-xs text-mist-dim transition-colors duration-200 hover:text-white focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
        >
          ← {t('canvas.back')}
        </Link>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label={t('canvas.titleLabel')}
          className="min-w-0 flex-1 rounded bg-transparent text-sm text-white focus-visible:outline-none"
        />
        {/* Autosave status: quiet when saved, amber + retry when not. Never a
            toast — an autosave that shouts on every blip is worse than silent. */}
        {saveState === 'saved' ? (
          <span className="shrink-0 text-[11px] text-mist-dim">{t('canvas.save.saved')}</span>
        ) : saveState === 'saving' ? (
          <span className="shrink-0 text-[11px] text-mist-dim">{t('canvas.save.saving')}</span>
        ) : (
          <button
            type="button"
            onClick={retrySave}
            className="shrink-0 rounded text-[11px] text-glow-amber underline focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
          >
            {t('canvas.save.failed')}
          </button>
        )}
        <BalanceChip />
      </header>

      {doc.isPending ? (
        <div className="flex flex-1 items-center justify-center">
          <Skeleton className="h-64 w-96" />
        </div>
      ) : doc.isError ? (
        <div className="flex flex-1 items-center justify-center px-6">
          <ErrorState message={t('canvas.docError')} onRetry={() => void doc.refetch()} />
        </div>
      ) : isLoaded ? (
        <CanvasEditor models={models} />
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <Skeleton className="h-64 w-96" />
        </div>
      )}
    </div>
  )
}
