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
//     and a WORKBENCH pinned at the bottom — the composer (selected shot) above
//     the TRACKS panel (video lane + audio lane), the way every real edit bay
//     stacks it: picture up top, tracks under your hands.
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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  CatalogAudioModel,
  CatalogModel,
  CatalogVideoModel,
  TemplateSummary,
} from '@opencreate/contracts'
import { ErrorState, Skeleton } from 'shared/ui'
import { useFilm } from '../model/filmsApi'
import { useCreateRender, useRender } from '../model/rendersApi'
import { shotStartMs } from '../model/voiceoverApi'
import { FilmEditorHeader } from './FilmEditorHeader'
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
}

// The editor column fills the viewport under the 44px app bar + the route's
// 16px paddings — NO page scroll: the stage scrolls inside itself and the
// workbench stays under the user's hands, like a real edit bay.
const EDITOR_COLUMN = 'flex h-[calc(100svh-76px)] min-h-0 flex-col gap-3'

export function FilmEditor({ filmId, models, templates = [], entities = [] }: FilmEditorProps) {
  const { t } = useTranslation()
  const { data, isPending, isError, refetch } = useFilm(filmId)
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null)
  const [isStoryboardOpen, setIsStoryboardOpen] = useState(false)

  // Export state lives HERE (v7): the header's ⋯ menu item (hidden while a
  // render is in flight) and the transient RenderBar status strip must read
  // one truth, and neither owns the other.
  const createRender = useCreateRender()
  const [renderId, setRenderId] = useState<string | null>(null)
  const activeRender = useRender(filmId, renderId).data
  const startExport = () =>
    createRender.mutate(filmId, { onSuccess: (created) => setRenderId(created.id) })
  const isExporting = createRender.isPending || activeRender?.status === 'processing'

  // Loading: the silhouette of the v7 column — title row + preview up top,
  // composer + tracks at the bottom. Nothing jumps in.
  if (isPending) {
    return (
      <div className={EDITOR_COLUMN}>
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="aspect-video max-h-[42svh] w-full" />
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    )
  }

  if (isError) {
    return <ErrorState message={t('errors.loadFailed')} onRetry={() => void refetch()} />
  }

  const videoModels = models.filter((m): m is CatalogVideoModel => m.type === 'video')
  const audioModels = models.filter((m): m is CatalogAudioModel => m.type === 'audio')
  const ttsModel = audioModels.find((m) => m.audioKind === 'tts')
  const filmAspect = data.film.aspectRatio
  const selectedShot = data.shots.find((shot) => shot.id === selectedShotId)
  // The editor is the only place that knows every shot's duration, so it is the
  // only place that can say where on the timeline a shot's spoken line belongs.
  // The inspector receives the answer, not the shot list.
  const selectedStartMs = selectedShot ? shotStartMs(data.shots, selectedShot.id) : 0
  const isSelectedVoiced = data.audio.some((track) => track.shotId === selectedShotId)
  // null for a hand-made film, and null while ['templates'] is still in flight —
  // in both cases the audio panel simply opens with an empty music field, which
  // is exactly what it did before templates existed.
  const musicPrompt =
    templates.find((template) => template.id === data.film.templateId)?.musicPrompt ?? null

  return (
    <div className={EDITOR_COLUMN}>
      {/* STAGE — scrolls inside itself: title row, the transient export status
          strip, then the preview. The workbench below never moves. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto">
        <FilmEditorHeader
          film={data.film}
          onExport={startExport}
          canExport={data.shots.length > 0 && !isExporting}
        />
        <RenderBar
          render={activeRender}
          isStarting={createRender.isPending}
          hasStartError={createRender.isError && !activeRender}
          onRetry={startExport}
        />
        <PreviewPlayer shots={data.shots} filmAspect={filmAspect} />
      </div>

      {/* WORKBENCH — the edit bay under the user's hands: the composer for the
          selected shot (a slim hint row when nothing is), then the TRACKS. */}
      <div className="flex shrink-0 flex-col gap-2">
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
            startMs={selectedStartMs}
            isVoiced={isSelectedVoiced}
          />
        ) : (
          <p className="rounded-2xl border border-white/10 bg-steel px-4 py-2.5 text-xs text-mist-dim">
            {t('cinema.inspector.selectHint')}
          </p>
        )}

        {/* The tracks: video lane (duration-proportional tiles) with the film's
            audio lane directly beneath — see Timeline.tsx (v7) */}
        <Timeline
          film={data}
          audioModels={audioModels}
          musicPrompt={musicPrompt}
          selectedShotId={selectedShotId}
          onSelectShot={setSelectedShotId}
          onOpenStoryboard={() => setIsStoryboardOpen(true)}
        />
      </div>

      <StoryboardModal
        filmId={filmId}
        defaultStyleId={data.film.defaultStyleId}
        isOpen={isStoryboardOpen}
        onClose={() => setIsStoryboardOpen(false)}
      />
    </div>
  )
}
