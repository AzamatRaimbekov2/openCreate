// apps/web/src/modules/Cinema/components/ShotClipStatus.tsx
// The one-line live status of the selected shot's clip, extracted from
// ShotInspector so that file stays an orchestrator (the 200-line ceiling is a
// decomposition trigger, not a suggestion).
//
// Status is NEVER color-only (design.md §8): the word carries the meaning and
// the triad glow only reinforces it. `role="status"` for in-flight progress
// (polite), `role="alert"` for failure (assertive) — a failed generation costs
// the user credits, so it interrupts.
import { useTranslation } from 'react-i18next'

export type ShotClipStatusProps = {
  // Undefined until the shared ['generation', id] cache answers
  status: 'processing' | 'succeeded' | 'failed' | undefined
  // 0–100 while processing; null before the provider reports any
  progress: number | null
  // False for an empty shot or a title card — there is no clip to report on
  hasClip: boolean
}

export function ShotClipStatus({ status, progress, hasClip }: ShotClipStatusProps) {
  const { t } = useTranslation()
  if (!hasClip) return null

  if (status === 'processing') {
    return (
      <p role="status" className="text-xs text-glow-amber">
        {t('cinema.shot.generating')}
        {progress !== null ? ` · ${progress}%` : ''}
      </p>
    )
  }
  if (status === 'succeeded') {
    return <p className="text-xs text-glow-green">{t('cinema.shot.ready')}</p>
  }
  if (status === 'failed') {
    return (
      <p role="alert" className="text-xs text-glow-red">
        {t('cinema.shot.failed')}
      </p>
    )
  }
  return null
}
