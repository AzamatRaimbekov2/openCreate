// apps/web/src/modules/Cinema/components/FilmEditor.tsx
// The /cinema/$filmId editor body: loads the film's composite detail (4-states)
// and lays out the workspace. Owns the ONE piece of shared UI state, the selected
// shot id, so the strip and the inspector always agree. The catalog `models`
// arrive from the route (the cross-module seam), split here into the video/audio
// lists the child surfaces need.
//
// v6 LAYOUT — why it is shaped like this:
//   * v5 put the timeline ABOVE the workspace, right under the title row (at
//     the bottom it lived below the fold, and selecting a beat meant scrolling
//     twice per edit). That stands.
//   * v6 retired the 360px side rail: the shot editor became a COMPOSER DOCK
//     fixed to the bottom of the viewport (ShotInspector renders the fixed
//     shell itself). The rail was the one column fighting the preview for
//     width, and a long prompt lived in a cramped corner box; a bottom dock is
//     the shape prompt-first tools train users on — type below, result above.
//   * The stage (preview · export · audio) now spans the full width. The editor
//     body carries pb-36 so the docked composer never hides the audio card;
//     with no shot selected a slim hint dock stands in for the composer.
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

// The floating dock shell shared by the composer's stand-in hint (the composer
// itself renders the same shell inside ShotInspector)
const DOCK = 'fixed inset-x-0 bottom-0 z-30 px-4 pb-3'

export function FilmEditor({ filmId, models, templates = [], entities = [] }: FilmEditorProps) {
  const { t } = useTranslation()
  const { data, isPending, isError, refetch } = useFilm(filmId)
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null)
  const [isStoryboardOpen, setIsStoryboardOpen] = useState(false)

  // Loading: the silhouette of the layout above — header, stage column (hero +
  // action bar + audio), inspector rail, then the strip. Nothing jumps in.
  if (isPending) {
    return (
      <div className="flex flex-col gap-4 pb-36">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-28 w-full" />
        <div className="flex min-w-0 flex-col gap-4">
          <Skeleton className="aspect-video max-h-[42svh] w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-24 w-full" />
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
    // pb-36 clears the fixed composer dock — the audio card must stay reachable
    // with the dock floating over the page bottom
    <div className="flex flex-col gap-4 pb-36">
      <FilmEditorHeader film={data.film} />

      {/* The film strip: the table of contents, right under the title — always
          on screen next to the stage it indexes (v5; see the layout note above) */}
      <Timeline
        film={data}
        selectedShotId={selectedShotId}
        onSelectShot={setSelectedShotId}
        onOpenStoryboard={() => setIsStoryboardOpen(true)}
      />

      {/* Stage: what you look at, then what you do with it, then the extras —
          full width since v6 (the shot editor docked to the viewport bottom) */}
      <div className="flex min-w-0 flex-col gap-4">
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

      {/* The composer dock. Keyed by shot.id so a new selection re-inits the
          draft. With nothing selected, a slim hint bar holds the dock's place
          so the layout (and the pb-36 clearance) never jumps. */}
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
        <div className={DOCK}>
          <p className="mx-auto w-full max-w-4xl rounded-2xl border border-white/10 bg-steel px-4 py-3 text-xs text-mist-dim shadow-2xl shadow-black/50">
            {t('cinema.inspector.selectHint')}
          </p>
        </div>
      )}

      <StoryboardModal
        filmId={filmId}
        defaultStyleId={data.film.defaultStyleId}
        isOpen={isStoryboardOpen}
        onClose={() => setIsStoryboardOpen(false)}
      />
    </div>
  )
}
