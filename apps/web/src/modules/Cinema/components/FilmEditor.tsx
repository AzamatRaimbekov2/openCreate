// apps/web/src/modules/Cinema/components/FilmEditor.tsx
// The /cinema/$filmId editor body: loads the film's composite detail (4-states)
// and lays out the workspace. Owns the ONE piece of shared UI state, the selected
// shot id, so the strip and the inspector always agree. The catalog `models`
// arrive from the route (the cross-module seam), split here into the video/audio
// lists the child surfaces need.
//
// v7 LAYOUT — a real NLE workbench (owner request 2026-07-16):
//   * The editor is ONE viewport-height column with NO page scroll: a STAGE on
//     top (title row · export status strip · preview) that scrolls internally,
//     and the TRACKS panel (video lane + audio lane) pinned at the bottom.
//     The COMPOSER is not in the column at all — it is a position:fixed DOCK
//     on the viewport's bottom edge (owner directive 2026-07-17: the chat must
//     not consume screen height; its growth overlays instead of squeezing).
//   * The timeline moved back DOWN, but as tracks, not a strip: shot tiles are
//     laid out proportionally to their duration and the film's audio (music
//     beds, voiceovers) renders as a lane directly beneath the footage — see
//     Timeline.tsx. The standalone «Звук» card is gone; adding music/voice
//     lives in the timeline's «+» dialog.
//   * Export lives in the header's ⋯ menu; RenderBar is a transient status
//     strip on the stage that exists only while a render is starting/running/
//     finished. FilmEditor owns the kick-off + poll because the menu (hide
//     while in flight) and the strip must read ONE state.
// Panels are `Card` (design.md v4); the module no longer hand-rolls a PANEL
// class string, which is what made the player, the export button and the track
// list read with identical weight.
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  CatalogAudioModel,
  CatalogModel,
  CatalogVideoModel,
  Style,
  TemplateSummary,
} from '@opencreate/contracts'
import { ErrorState, Skeleton } from 'shared/ui'
import { useExportController } from '../model/useExportController'
import { useFilm } from '../model/filmsApi'
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
const EDITOR_COLUMN = 'flex h-[calc(100svh-76px)] min-h-0 flex-col gap-3 pb-24'
// The padded workbench canvas UNDER the full-bleed top bar. The route now hands
// FilmEditor the whole width (no <main> of its own), so the horizontal gutter
// lives here — matching the fixed dock's px-4 xl:px-6 so the composer stays
// aligned with the column edges.
const EDITOR_MAIN = 'w-full px-4 py-4 xl:px-6'

export function FilmEditor({
  filmId,
  models,
  templates = [],
  entities = [],
  styles = [],
  chrome,
}: FilmEditorProps) {
  const { t } = useTranslation()
  const { data, isPending, isError, refetch } = useFilm(filmId)
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null)
  const [isStoryboardOpen, setIsStoryboardOpen] = useState(false)

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
    />
  )

  // Loading: the bar (with its own title Skeleton) + the column silhouette —
  // preview up top, tracks at the bottom. Nothing jumps in.
  if (isPending) {
    return (
      <>
        {header}
        <main className={EDITOR_MAIN}>
          <div className={EDITOR_COLUMN}>
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <Skeleton className="aspect-video max-h-[42svh] w-full" />
            </div>
            {/* Tracks silhouette only — the composer is a fixed dock outside the
                column flow, so the skeleton reserves nothing for it */}
            <Skeleton className="h-32 w-full shrink-0" />
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
        <div className={EDITOR_COLUMN}>
          {/* STAGE — scrolls inside itself: the transient export status strip,
              then the preview. The title/export controls moved UP to the top bar
              (CinemaEditorHeader); the workbench below never moves. */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto">
            <RenderBar
              state={exp.state}
              progress={exp.progress}
              blockedMessage={exp.blockedMessage}
              // Naming the shot is most of the fix; letting the user GO there is the
              // rest. Selection already lives in this component and drives both the
              // composer and the tile highlight, so this is a one-line affordance.
              onShowSubject={jumpToBlockedShot ? () => setSelectedShotId(jumpToBlockedShot) : null}
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

          <StoryboardModal
            filmId={filmId}
            defaultStyleId={data.film.defaultStyleId}
            styles={styles}
            isOpen={isStoryboardOpen}
            onClose={() => setIsStoryboardOpen(false)}
          />
        </div>
      </main>

      {/* THE DOCK — position:fixed to the viewport bottom (owner directive
          2026-07-17: the chat must not CONSUME screen height). Out of flow,
          its growth (drawers, prompt resize — both extend UPWARD) overlays the
          tracks/stage instead of squeezing them; the column above reserves only
          the collapsed height (pb-28). z-40 floats over the workbench but under
          Modal's z-50 sheets. The wrapper is click-through (pointer-events-none)
          with the same horizontal padding as the route canvas (px-4 xl:px-6),
          so the dock stays aligned with the column edges; the dock itself
          re-enables pointer events. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-4 xl:px-6">
        <div className="pointer-events-auto">
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
        </div>
      </div>
    </>
  )
}
