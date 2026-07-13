// apps/web/src/modules/Cinema/components/FilmEditor.tsx
// The /cinema/$filmId editor body: loads the film's composite detail (4-states)
// and lays out the workspace. Owns the ONE piece of shared UI state, the selected
// shot id, so the strip and the inspector always agree. The catalog `models`
// arrive from the route (the cross-module seam), split here into the video/audio
// lists the child surfaces need.
//
// v4 LAYOUT — why it is shaped like this:
//   * The old deck was `lg:grid-cols-2`: preview + render + audio stacked on the
//     left, and ONE inspector panel on the right stretched to their combined
//     height. With no shot selected that right half was a tall empty rectangle
//     with a hint floating in the middle of it. Dead space, and it made the
//     inspector look like the main event.
//   * Now: a STAGE column (`minmax(0,1fr)`) carries the preview as the hero, the
//     export bar as compact chrome under it, and audio as a quiet card; a narrow
//     INSPECTOR RAIL (380px) is `sticky` + `h-fit`, so it is exactly as tall as
//     its content and follows you down the page instead of stretching.
//   * The timeline moved BELOW the workspace and spans the full width — a film
//     strip, the way every real editor arranges it.
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
import { EmptyState, ErrorState, Skeleton } from 'shared/ui'
import { useFilm } from '../model/filmsApi'
import { shotStartMs } from '../model/voiceoverApi'
import { FilmEditorHeader } from './FilmEditorHeader'
import { Timeline } from './Timeline'
import { PreviewPlayer } from './PreviewPlayer'
import { RenderBar } from './RenderBar'
import { AudioTracks } from './AudioTracks'
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

// Stage takes the slack, the inspector rail is fixed. minmax(0,1fr) (not 1fr)
// so a wide video/prompt can never push the rail off the grid.
const WORKSPACE = 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]'
// top-20 clears the app's sticky steel nav bar (h-16); top-6 would slide the
// inspector underneath it as you scroll.
const RAIL = 'flex flex-col gap-6 lg:sticky lg:top-20 lg:h-fit lg:self-start'

export function FilmEditor({ filmId, models, templates = [], entities = [] }: FilmEditorProps) {
  const { t } = useTranslation()
  const { data, isPending, isError, refetch } = useFilm(filmId)
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null)
  const [isStoryboardOpen, setIsStoryboardOpen] = useState(false)

  // Loading: the silhouette of the layout above — header, stage column (hero +
  // action bar + audio), inspector rail, then the strip. Nothing jumps in.
  if (isPending) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-9 w-64" />
        <div className={WORKSPACE}>
          <div className="flex min-w-0 flex-col gap-6">
            <Skeleton className="aspect-video w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
          <Skeleton className="h-96 w-full" />
        </div>
        <Skeleton className="h-48 w-full" />
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
    <div className="flex flex-col gap-6">
      <FilmEditorHeader film={data.film} />

      <div className={WORKSPACE}>
        {/* Stage: what you look at, then what you do with it, then the extras */}
        <div className="flex min-w-0 flex-col gap-6">
          <PreviewPlayer shots={data.shots} filmAspect={filmAspect} />
          <RenderBar filmId={filmId} canRender={data.shots.length > 0} />
          <AudioTracks
            filmId={filmId}
            audio={data.audio}
            audioModels={audioModels}
            musicPrompt={musicPrompt}
            shotIds={data.shots.map((shot) => shot.id)}
          />
        </div>

        {/* Inspector rail. Keyed by shot.id so a new selection re-inits the draft.
            With nothing selected it is a short EmptyState, never a tall void. */}
        <aside className={RAIL}>
          {selectedShot ? (
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
            <EmptyState
              title={t('cinema.inspector.emptyTitle')}
              description={t('cinema.inspector.selectHint')}
            />
          )}
        </aside>
      </div>

      {/* The film strip spans the full width, below the workspace */}
      <Timeline
        film={data}
        selectedShotId={selectedShotId}
        onSelectShot={setSelectedShotId}
        onOpenStoryboard={() => setIsStoryboardOpen(true)}
      />

      <StoryboardModal
        filmId={filmId}
        defaultStyleId={data.film.defaultStyleId}
        isOpen={isStoryboardOpen}
        onClose={() => setIsStoryboardOpen(false)}
      />
    </div>
  )
}
