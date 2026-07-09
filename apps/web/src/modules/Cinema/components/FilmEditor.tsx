// apps/web/src/modules/Cinema/components/FilmEditor.tsx
// The /cinema/$filmId editor body: loads the film's composite detail (4-states)
// and lays out the workspace — header, timeline strip, and a two-column deck of
// (preview + render + audio) beside the shot inspector. Owns the ONE piece of
// shared UI state, the selected shot id, so the strip and the inspector always
// agree. The catalog `models` arrive from the route (the cross-module seam),
// split here into the video/audio lists the child surfaces need.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CatalogAudioModel, CatalogModel, CatalogVideoModel } from '@opencreate/contracts'
import { ErrorState, Skeleton } from 'shared/ui'
import { useFilm } from '../model/filmsApi'
import { FilmEditorHeader } from './FilmEditorHeader'
import { Timeline } from './Timeline'
import { PreviewPlayer } from './PreviewPlayer'
import { RenderBar } from './RenderBar'
import { AudioTracks } from './AudioTracks'
import { ShotInspector } from './ShotInspector'
import { StoryboardModal } from './StoryboardModal'

export type FilmEditorProps = {
  filmId: string
  // Full catalog from the route; split into video/audio lists below
  models: CatalogModel[]
}

const PANEL = 'rounded-lg border border-white/10 p-4'

export function FilmEditor({ filmId, models }: FilmEditorProps) {
  const { t } = useTranslation()
  const { data, isPending, isError, refetch } = useFilm(filmId)
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null)
  const [isStoryboardOpen, setIsStoryboardOpen] = useState(false)

  // Loading: a header bar + strip + deck silhouette so nothing jumps in
  if (isPending) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-40 w-full" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="aspect-video w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    )
  }

  if (isError) {
    return <ErrorState message={t('errors.loadFailed')} onRetry={() => void refetch()} />
  }

  const videoModels = models.filter((m): m is CatalogVideoModel => m.type === 'video')
  const audioModels = models.filter((m): m is CatalogAudioModel => m.type === 'audio')
  const filmAspect = data.film.aspectRatio
  const selectedShot = data.shots.find((shot) => shot.id === selectedShotId)

  return (
    <div className="flex flex-col gap-6">
      <FilmEditorHeader film={data.film} />

      <Timeline
        film={data}
        selectedShotId={selectedShotId}
        onSelectShot={setSelectedShotId}
        onOpenStoryboard={() => setIsStoryboardOpen(true)}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left deck: preview → export → audio */}
        <div className="flex flex-col gap-6">
          <div className={PANEL}>
            <PreviewPlayer shots={data.shots} filmAspect={filmAspect} />
          </div>
          <div className={PANEL}>
            <RenderBar filmId={filmId} canRender={data.shots.length > 0} />
          </div>
          <div className={PANEL}>
            <AudioTracks filmId={filmId} audio={data.audio} audioModels={audioModels} />
          </div>
        </div>

        {/* Right: the inspector for the selected shot, keyed so it re-inits */}
        <div className={PANEL}>
          {selectedShot ? (
            <ShotInspector
              key={selectedShot.id}
              filmId={filmId}
              shot={selectedShot}
              filmAspect={filmAspect}
              videoModels={videoModels}
            />
          ) : (
            <p className="grid h-full min-h-40 place-items-center px-4 text-center text-sm text-mist-dim">
              {t('cinema.inspector.selectHint')}
            </p>
          )}
        </div>
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
