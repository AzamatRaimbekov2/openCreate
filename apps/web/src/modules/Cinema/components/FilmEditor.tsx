// apps/web/src/modules/Cinema/components/FilmEditor.tsx
// The /cinema/$filmId editor body: loads the film's composite detail (4-states)
// and lays out the workspace. Owns the ONE piece of shared UI state, the selected
// shot id, so the strip and the inspector always agree. The catalog `models`
// arrive from the route (the cross-module seam), split here into the video/audio
// lists the child surfaces need.
//
// v8 LAYOUT — 70/30 two-column workbench (owner request 2026-07-24, "2 блока в
// ряд"). The v7 fixed bottom-dock composer is RETIRED. Under the 44px top bar,
// `<main>` holds a two-column grid:
//   * LEFT 70% (the MONTAGE): the PreviewPlayer grows to fill the height (with
//     the transient export strip above it, scrolling inside) over the TRACKS
//     panel (video + audio lanes — see Timeline.tsx). This is the "кадры,
//     монтажный блок".
//   * RIGHT 30% (the COMPOSER INPUT): the selected shot's editor (ShotInspector)
//     — the prompt field + model/duration/cast/generate. This is the "инпут где
//     промтом создаём фильмы". It scrolls vertically if the form is tall.
// No page scroll: `main` is `overflow-hidden` and each column owns its overflow;
// the grid fills the height via a flex chain (a % `h-full` would not resolve
// against a flex-grown parent). Export state stays owned here (the header CTA and
// the RenderBar strip read one truth). Panels are `Card` (design.md v4).
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import type {
  CatalogAudioModel,
  CatalogModel,
  CatalogVideoModel,
  Style,
  TemplateSummary,
} from '@opencreate/contracts'
import { ErrorState, Skeleton, toast } from 'shared/ui'
// The ONE approved exception to "modules never import each other" (owner
// request, "Export to Canvas"): Cinema may reach into Canvas's public API to
// create + save a one-off document. See modules/Canvas/index.ts.md.
import { saveCanvas, useCreateCanvas } from 'modules/Canvas'
import { useExportController } from '../model/useExportController'
import { buildCanvasDocFromFilm } from '../model/exportToCanvas'
import { useFilm } from '../model/filmsApi'
import { useShotGenerations } from '../model/shotGeneration'
import { useTimelineClock } from '../model/timelineClock'
import { totalDurationMs } from '../model/timelineGeometry'
import { useTimelineKeys } from '../model/useTimelineKeys'
import { shotStartMs } from '../model/voiceoverApi'
import { CinemaEditorHeader } from './CinemaEditorHeader'
import { Timeline } from './Timeline'
import { PreviewPlayer } from './PreviewPlayer'
import { RenderBar } from './RenderBar'
import type { CastableEntity } from './ShotCastField'
import { ShotInspector } from './ShotInspector'
import { StoryboardModal } from './StoryboardModal'

export type FilmEditorProps = {
  filmId: string
  // Full catalog from the route; split into video/audio lists below
  models: CatalogModel[]
  // The template catalog, injected FROM THE ROUTE — the same seam `models` uses,
  // and the reason Cinema still imports nothing from Templates.
  //
  // The route cannot resolve the film's template itself (it does not load the
  // film; this component does), so it hands over the list and the lookup happens
  // here. What we want out of it is one string: the music bed the film's template
  // recommends, which pre-fills the audio panel. "Melancholic soap-opera strings,
  // dramatic piano, slow and heavy" is not something a user thinks to write — it
  // is something a person who has watched a hundred of these videos knows, and
  // handing it over as an editable default is most of the difference between a
  // film that sounds like the format and one that doesn't.
  templates?: TemplateSummary[]
  // The character library, injected FROM THE ROUTE — the third use of the same
  // seam, and for the same reason: Cinema must not import Entities. Only id+name
  // travel, because that is all the inspector needs to show a chip and send a tag.
  // Empty while the library is empty; the cast control then says so rather than
  // offering a dead button.
  entities?: CastableEntity[]
  // The style registry — the seven builtins plus the styles this user wrote in
  // the Style Studio — read at the route and passed down (ADR style-studio D5;
  // Cinema must not import modules/Styles). It reaches THREE style pickers from
  // here: the shot inspector's, the storyboard's, and — via the header — the
  // film's default. Empty while GET /api/styles is in flight; each picker then
  // falls back to the bundled builtins, so a style choice never disappears.
  styles?: Style[]
  // The global chrome (balance · lang · account) for the editor's OWN top bar,
  // injected by the route. This module can't import modules/Auth or
  // modules/Credits, so — exactly like AppShell's `balanceSlot` — the route
  // composes the node and FilmEditor passes it straight through to
  // CinemaEditorHeader. Undefined in tests (the bar renders without it).
  chrome?: ReactNode
}

// The editor column fills the viewport under the 44px editor top bar
// (CinemaEditorHeader, same height as the old AppShell) + the main's 16px
// paddings — NO page scroll: the stage scrolls inside itself and the workbench
// stays under the user's hands, like a real edit bay. The 76px subtrahend is
// unchanged from when the global AppShell sat here: 44 (bar) + 32 (main py-4).
// pb-24 is the COLLAPSED dock's clearance: the composer is position:fixed
// (out of flow — see the dock below), so the column must leave exactly one
// idle-dock's worth of room or the tracks would sit under it forever (the
// column does not scroll). Dock GROWTH (drawers, prompt resize) deliberately
// overlays the column instead of claiming more clearance — that growth not
// squeezing the stage is the whole point of the fixed dock.
// Tightened 28→24 (owner 2026-07-22): the old clearance left a visible empty
// band between the tracks and the composer. If the tracks ever tuck UNDER the
// collapsed dock, nudge this back up a step.
// v8 LAYOUT — 70/30 two-column workbench (owner request 2026-07-24, "2 блока в
// ряд"): the floating bottom dock is RETIRED. `<main>` fills the height under the
// 44px top bar and holds a two-column grid — LEFT 70% is the MONTAGE (preview
// over the timeline), RIGHT 30% is the composer INPUT where you write the shot's
// prompt. No page scroll: each column owns its own overflow.
// `flex flex-col` + `flex-1` so the grid below fills the height via flex-grow —
// a percentage `h-full` would NOT resolve here (main's own height comes from
// flex-grow, and % heights need an explicit parent height). `overflow-hidden`
// contains any child overflow so the PAGE never scrolls horizontally.
const EDITOR_MAIN = 'flex min-h-0 w-full flex-1 flex-col overflow-hidden px-4 py-4 xl:px-6'
// The two-column grid: single column below `lg`, 70/30 at `lg`+. `flex-1` (not
// `h-full`) makes it fill main's height reliably; `min-h-0`/`min-w-0` let the
// columns shrink so their content scrolls internally instead of the page.
const EDITOR_GRID = 'grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[7fr_3fr]'
// LEFT 70% — the montage: a preview that grows (scrolls inside) over the timeline.
const MONTAGE_COL = 'flex min-h-0 min-w-0 flex-col gap-3'
// RIGHT 30% — the composer input column. `flex flex-col` so the ShotInspector
// inside fills the FULL height (owner request 2026-07-24 "чат на всю высоту"):
// it stretches to the column and manages its own internal scroll (the drawer
// caps at 40svh, the prompt grows, the controls stay pinned at the bottom).
const COMPOSER_COL = 'flex min-h-0 min-w-0 flex-col'

export function FilmEditor({
  filmId,
  models,
  templates = [],
  entities = [],
  styles = [],
  chrome,
}: FilmEditorProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data, isPending, isError, refetch } = useFilm(filmId)
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null)
  const [isStoryboardOpen, setIsStoryboardOpen] = useState(false)
  const [isExportingToCanvas, setIsExportingToCanvas] = useState(false)
  const createCanvas = useCreateCanvas()

  // The timeline clock is a singleton (Timeline + PreviewPlayer share it), so it
  // would otherwise carry a stale playhead into a different film. Zero it when the
  // editor opens THIS film and when it leaves — the only lifecycle coupling the
  // editor has to the clock; all seeking is owned by the timeline surfaces.
  const resetClock = useTimelineClock((state) => state.reset)
  useEffect(() => {
    resetClock()
    return () => resetClock()
  }, [filmId, resetClock])

  // Editor keyboard shortcuts (Phase 4) — mounted once at the editor root so they
  // work whether focus is on a tile, the ruler or nowhere; suppressed while typing
  // in the composer (the hook gates on document.activeElement). `?? []` keeps the
  // hook order stable through the loading state (data is undefined until it loads).
  useTimelineKeys(filmId, data?.shots ?? [])

  // CLIENT-SIDE EXPORT (client-side-export ADR, 2026-07-23): the final assembly
  // runs in the BROWSER now (streaming WebCodecs), so the server render is retired
  // from this path — no `useCreateRender`/`useRender`, no `latestRender` polling,
  // no reload-recovery or 409 concurrency guard (those behaviours don't exist
  // client-side; `render.ts` + the routes stay dormant). `useExportController`
  // owns the one truth the header CTA and the RenderBar strip both read: the
  // pipeline state/progress + the CLIENT validation (a clip not ready / no shots
  // still REFUSES the export, with the same named reasons) + the capability gate.
  // Called before the guards (data may be undefined) to keep the hook order stable.
  const exp = useExportController(data)
  // Only a SHOT can be jumped to — selection is a shot-level concept the editor
  // already owns, so "show me" is a real affordance.
  const jumpToBlockedShot = exp.blockedShotId

  // Export to Canvas: resolve every cited generation's TYPE/STATUS/media (the
  // pure `buildCanvasDocFromFilm` needs the full row, not just its id) through
  // the SAME cache the clip thumbnails/preview already share. `?? []` keeps
  // the hook order stable through the loading state, same discipline as
  // `useTimelineKeys` above.
  const shotGenerationIds = (data?.shots ?? []).flatMap((shot) =>
    shot.generationId !== null ? [shot.generationId] : [],
  )
  const generationsById = useShotGenerations(shotGenerationIds)

  // One-off "Export to Canvas": build the doc from the CURRENT film, create a
  // brand-new canvas, save the doc into it, then navigate there. No live link
  // back — a snapshot, not a sync. Guards its own re-entrancy (a second click
  // while one export is already running is ignored) since the ⋯ Menu item has
  // no built-in disabled/loading affordance.
  const onExportToCanvas = async () => {
    if (isExportingToCanvas || !data) return
    const doc = buildCanvasDocFromFilm(data.film, data.shots, generationsById)
    if (!doc) {
      toast.error({
        title: t('toasts.exportToCanvas.emptyTitle'),
        description: t('toasts.exportToCanvas.emptyDescription'),
      })
      return
    }
    setIsExportingToCanvas(true)
    try {
      const canvas = await createCanvas.mutateAsync(doc.title)
      await saveCanvas(canvas.id, doc)
      void navigate({ to: '/canvas/$canvasId', params: { canvasId: canvas.id } })
    } catch {
      toast.error({
        title: t('toasts.exportToCanvas.failedTitle'),
        description: t('toasts.exportToCanvas.failedDescription'),
      })
    } finally {
      setIsExportingToCanvas(false)
    }
  }

  // The editor's OWN top bar — rendered in EVERY state (loading/error/data) so
  // the bar never pops in. It replaces the global AppShell nav on this route
  // (owner request 2026-07-23); the `chrome` slot carries the balance/lang/
  // account the route injected. Export state is passed down here because
  // FilmEditor owns the one truth the RenderBar strip also reads.
  const header = (
    <CinemaEditorHeader
      film={data?.film}
      onExport={exp.onExport}
      canExport={exp.canExport}
      isStarting={exp.isStarting}
      // The film-META chips: shot count + total length. The editor is the only
      // place that holds the shot list, so it computes both and hands them down.
      shotCount={data?.shots.length}
      durationMs={data ? totalDurationMs(data.shots) : undefined}
      styles={styles}
      chrome={chrome}
      onExportToCanvas={() => void onExportToCanvas()}
      isExportingToCanvas={isExportingToCanvas}
    />
  )

  // Loading: the bar (with its own title Skeleton) + the column silhouette —
  // preview up top, tracks at the bottom. Nothing jumps in.
  if (isPending) {
    return (
      <>
        {header}
        <main className={EDITOR_MAIN}>
          <div className={EDITOR_GRID}>
            {/* LEFT 70% silhouette: preview over tracks */}
            <div className={MONTAGE_COL}>
              <Skeleton className="min-h-0 w-full flex-1" />
              <Skeleton className="h-32 w-full shrink-0" />
            </div>
            {/* RIGHT 30% silhouette: the composer column */}
            <Skeleton className="hidden h-full w-full lg:block" />
          </div>
        </main>
      </>
    )
  }

  if (isError) {
    return (
      <>
        {header}
        <main className={EDITOR_MAIN}>
          <ErrorState message={t('errors.loadFailed')} onRetry={() => void refetch()} />
        </main>
      </>
    )
  }

  const videoModels = models.filter((m): m is CatalogVideoModel => m.type === 'video')
  const audioModels = models.filter((m): m is CatalogAudioModel => m.type === 'audio')
  const ttsModel = audioModels.find((m) => m.audioKind === 'tts')
  const filmAspect = data.film.aspectRatio
  // The FIRST shot is selected by default (owner report 2026-07-17): the
  // composer must be on the workbench the moment the editor opens — with
  // nothing selected users lost the prompt field entirely and read it as "the
  // chat disappeared". An explicit tile click still wins; a deleted selection
  // falls back to the first shot instead of an empty dock.
  const selectedShot = data.shots.find((shot) => shot.id === selectedShotId) ?? data.shots[0]
  // The editor is the only place that knows every shot's duration, so it is the
  // only place that can say where on the timeline a shot's spoken line belongs.
  // The inspector receives the answer, not the shot list.
  const selectedStartMs = selectedShot ? shotStartMs(data.shots, selectedShot.id) : 0
  const isSelectedVoiced = data.audio.some((track) => track.shotId === selectedShot?.id)
  // null for a hand-made film, and null while ['templates'] is still in flight —
  // in both cases the audio panel simply opens with an empty music field, which
  // is exactly what it did before templates existed.
  const musicPrompt =
    templates.find((template) => template.id === data.film.templateId)?.musicPrompt ?? null

  return (
    <>
      {header}
      <main className={EDITOR_MAIN}>
        <div className={EDITOR_GRID}>
          {/* LEFT 70% — THE MONTAGE: the preview (SHRINKS to fit — object-contain
              letterboxes) over the timeline, both inside 100svh with NO scroll
              (owner request 2026-07-24). No overflow-y-auto: the preview gives up
              height to the tracks instead of scrolling. */}
          <div className={MONTAGE_COL}>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
              <RenderBar
                state={exp.state}
                progress={exp.progress}
                blockedMessage={exp.blockedMessage}
                // Naming the shot is most of the fix; letting the user GO there is the
                // rest. Selection already lives in this component and drives both the
                // composer and the tile highlight, so this is a one-line affordance.
                onShowSubject={
                  jumpToBlockedShot ? () => setSelectedShotId(jumpToBlockedShot) : null
                }
                unsupportedMessage={exp.unsupportedMessage}
                onCancel={exp.onCancel}
                onRetry={exp.onRetry}
              />
              <PreviewPlayer shots={data.shots} />
            </div>

            {/* The tracks: video lane (duration-proportional tiles) with the film's
              audio lane directly beneath — see Timeline.tsx (v7). Receives the
              EFFECTIVE selection (default-first included), so the highlighted
              tile always matches the shot the composer is editing. */}
            <Timeline
              film={data}
              audioModels={audioModels}
              musicPrompt={musicPrompt}
              selectedShotId={selectedShot?.id ?? null}
              onSelectShot={setSelectedShotId}
              onOpenStoryboard={() => setIsStoryboardOpen(true)}
            />
          </div>

          {/* RIGHT 30% — THE COMPOSER INPUT: write the selected shot's prompt +
              its model/duration/cast/generate. Moved out of the retired fixed
              bottom dock into a real column (owner request 2026-07-24). */}
          <aside className={COMPOSER_COL}>
            {selectedShot ? (
              // Keyed by shot.id so a new selection re-inits the draft
              <ShotInspector
                key={selectedShot.id}
                filmId={filmId}
                shot={selectedShot}
                filmAspect={filmAspect}
                videoModels={videoModels}
                ttsModel={ttsModel}
                entities={entities}
                styles={styles}
                startMs={selectedStartMs}
                isVoiced={isSelectedVoiced}
              />
            ) : (
              <p className="rounded-2xl border border-white/10 bg-steel px-4 py-2.5 text-xs text-mist-dim">
                {t('cinema.inspector.selectHint')}
              </p>
            )}
          </aside>
        </div>
      </main>

      <StoryboardModal
        filmId={filmId}
        defaultStyleId={data.film.defaultStyleId}
        styles={styles}
        isOpen={isStoryboardOpen}
        onClose={() => setIsStoryboardOpen(false)}
      />
    </>
  )
}
