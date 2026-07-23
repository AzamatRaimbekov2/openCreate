// apps/web/src/modules/Cinema/model/useExportController.ts
// The editor-facing export controller (client-side-export ADR): it composes the
// client pipeline (`useFilmExport`) with the CLIENT validation (`computeExportBlock`
// over the generation cache) into the one API `FilmEditor` + `CinemaEditorHeader` +
// `RenderBar` read. This is the cutover point from the retired server render —
// `useCreateRender`/`useRender`/`latestRender` polling are gone; the export runs in
// the browser, but it STILL refuses (with the same named reasons) when a clip isn't
// ready, so a user can never "export" a film with a missing clip.
//
// Extracted from FilmEditor so that already-large file stays thin (the lead's
// note); it also keeps the export logic testable and one-source.
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { FilmDetail } from '@opencreate/contracts'
import type { FilmAudio, Shot } from '@opencreate/contracts'
import { computeExportBlock } from './computeExportBlock'
import { useFilmExport } from './useFilmExport'
import { useShotGenerations } from './shotGeneration'

// Stable empty fallbacks — a fresh `[]` each render would churn the useMemo deps.
const NO_SHOTS: Shot[] = []
const NO_AUDIO: FilmAudio[] = []

export type ExportController = {
  state: 'idle' | 'running' | 'done' | 'error'
  progress: number
  // Header button spinner while the encode runs.
  isStarting: boolean
  // Header CTA enabled: has shots, not already running, and supported. A BLOCKED
  // (but supported) film keeps the button enabled — clicking surfaces the reason.
  canExport: boolean
  errorMessage: string | null
  // The client refusal (a clip not ready / no shots), shown only after an attempt.
  blockedMessage: string | null
  blockedShotId: string | null
  // Persistent calm message when WebCodecs/File System Access is unavailable.
  unsupportedMessage: string | null
  onExport: () => void
  onCancel: () => void
  onRetry: () => void
}

export function useExportController(film: FilmDetail | undefined): ExportController {
  const { t } = useTranslation()
  const shots = film?.shots ?? NO_SHOTS
  const audio = film?.audio ?? NO_AUDIO
  // The clips + audio the validation needs, over the SHARED generation cache (the
  // same rows the timeline polls) — so the block reads real, live readiness.
  const generationIds = useMemo(() => {
    const ids = shots.map((shot) => shot.generationId).filter((id): id is string => id !== null)
    audio.forEach((track) => ids.push(track.generationId))
    return ids
  }, [shots, audio])
  const generationsById = useShotGenerations(generationIds)
  const block = computeExportBlock(shots, audio, generationsById, t)
  const exp = useFilmExport(film)
  // The block is nagging until the user actually tries to export (the old server
  // UX: click → reason), so it is gated on this.
  const [attempted, setAttempted] = useState(false)

  const supported = exp.isSupported
  const onExport = () => {
    setAttempted(true)
    // A refusal (unsupported, or a not-ready clip) shows in the RenderBar and does
    // NOT start the encode — the whole point of moving the validation client-side.
    if (!supported || block !== null) return
    void exp.startExport()
  }

  return {
    state: exp.state,
    progress: exp.progress,
    isStarting: exp.state === 'running',
    canExport: shots.length > 0 && exp.state !== 'running' && supported,
    errorMessage: exp.state === 'error' ? (exp.error ?? t('cinema.render.failed')) : null,
    blockedMessage: attempted && block !== null ? block.message : null,
    blockedShotId: block?.subjectKind === 'shot' ? (block.subjectId ?? null) : null,
    unsupportedMessage: supported ? null : t('cinema.render.unsupported'),
    onExport,
    onCancel: exp.cancel,
    onRetry: onExport,
  }
}
