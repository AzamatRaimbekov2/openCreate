// apps/web/src/modules/Cinema/model/useFilmExport.ts
// The export UI state machine (ADR: client-side-export) — the hook the editor's
// export action drives INSTEAD of the retired server render. It builds the pure
// plans, resolves clip/audio media urls from the shared generation cache, runs the
// client pipeline (lazy WebCodecs adapter) with progress + cancel, and either
// downloads the Blob (fallback) or leaves the streamed file on disk. The REAL
// pipeline is browser-only, so `run` is an injected seam: tests drive the state
// machine (idle → running → done/error/cancelled) with a fake runner, in jsdom.
//
// It charges NOTHING — the export is local compute (the ADR's whole point); the
// money path is untouched.
import { useMemo, useRef, useState } from 'react'
import type { AspectRatio, FilmAudio, FilmDetail, Shot } from '@opencreate/contracts'
import { audioMixPlan } from './audioMixPlan'
import { exportCapabilities } from './exportCapabilities'
import { exportPlan } from './exportPlan'
import type { ResolveMediaUrl } from './filmExportAudio'
import { runFilmExport } from './runFilmExport'
import { useShotGenerations } from './shotGeneration'

export type ExportState = 'idle' | 'running' | 'done' | 'error'

// Stable empty fallbacks — a fresh `[]` each render would churn the useMemo deps.
const NO_SHOTS: Shot[] = []
const NO_AUDIO: FilmAudio[] = []

// The pipeline seam — the real one lazy-loads the WebCodecs adapter; tests inject a
// fake. Returns a Blob (in-memory fallback → the hook downloads it) or null
// (streamed straight to disk → nothing to download).
export type RunFilmExportFn = (
  args: { shots: Shot[]; filmAudio: FilmAudio[]; aspect: AspectRatio; resolveUrl: ResolveMediaUrl },
  onProgress: (percent: number) => void,
  signal: AbortSignal,
) => Promise<Blob | null>

// The real runner: assemble the plan + canvas + the lazy browser adapter and run.
// The dynamic imports keep mediabunny/WebCodecs in the export chunk (three.js
// precedent) — off the main bundle.
const defaultRun: RunFilmExportFn = async (args, onProgress, signal) => {
  const plan = exportPlan(args.shots, args.aspect)
  const audio = audioMixPlan(args.shots, args.filmAudio)
  const canvas = document.createElement('canvas')
  canvas.width = plan.width
  canvas.height = plan.height
  const [{ createFilmFrameDrawer }, { createFilmExportSink }] = await Promise.all([
    import('./filmFrameDrawer'),
    import('./filmExporter'),
  ])
  const drawer = createFilmFrameDrawer(canvas, args.shots, args.resolveUrl)
  try {
    return await runFilmExport({
      plan,
      audioPlan: audio,
      canvas,
      drawFrame: drawer.draw,
      onProgress,
      signal,
      createSink: (targetCanvas, targetPlan, hasAudio) =>
        createFilmExportSink(targetCanvas, targetPlan, hasAudio, args.resolveUrl),
    })
  } finally {
    drawer.dispose()
  }
}

function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}

export type UseFilmExport = {
  state: ExportState
  progress: number
  error: string | null
  isSupported: boolean
  startExport: () => Promise<void>
  cancel: () => void
}

export function useFilmExport(
  // Undefined while the editor's film detail is still loading — the hook stays
  // stable (nothing exportable, `startExport` a no-op) so it can be called before
  // the guards, like the rest of the editor's hooks.
  film: FilmDetail | undefined,
  run: RunFilmExportFn = defaultRun,
): UseFilmExport {
  const shots = film?.shots ?? NO_SHOTS
  const filmAudio = film?.audio ?? NO_AUDIO
  // Every media the export needs — the clips + the audio tracks — over the SHARED
  // ['generation', id] cache, so the resolver reads the same rows the timeline does.
  const generationIds = useMemo(() => {
    const ids = shots.map((shot) => shot.generationId).filter((id): id is string => id !== null)
    filmAudio.forEach((track) => ids.push(track.generationId))
    return ids
  }, [shots, filmAudio])
  const clipsById = useShotGenerations(generationIds)
  const resolveUrl: ResolveMediaUrl = (generationId) => clipsById[generationId]?.mediaUrls[0] ?? null

  const [state, setState] = useState<ExportState>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const startExport = async () => {
    if (state === 'running' || shots.length === 0) return
    const controller = new AbortController()
    abortRef.current = controller
    setState('running')
    setProgress(0)
    setError(null)
    try {
      const blob = await run(
        { shots, filmAudio, aspect: film?.film.aspectRatio ?? '16:9', resolveUrl },
        setProgress,
        controller.signal,
      )
      if (blob !== null) downloadBlob(blob, `${film?.film.title || 'film'}.mp4`)
      setState('done')
    } catch (caught) {
      // A cancel is not a failure — it returns the UI to idle, no red state.
      if (controller.signal.aborted) setState('idle')
      else {
        setError(caught instanceof Error ? caught.message : 'export failed')
        setState('error')
      }
    } finally {
      abortRef.current = null
    }
  }

  const cancel = () => abortRef.current?.abort()

  return { state, progress, error, isSupported: exportCapabilities().supported, startExport, cancel }
}
