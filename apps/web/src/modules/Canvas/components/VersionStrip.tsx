// apps/web/src/modules/Canvas/components/VersionStrip.tsx
// "v2 / 3": regeneration APPENDS to the node's generationIds, so a node keeps
// every run it paid for; this strip steps through them. Controlled — the
// parent owns which version shows, because the same index also drives which
// generation the node polls.
import { useTranslation } from 'react-i18next'

export type VersionStripProps = {
  count: number
  // 0-based index of the shown version
  index: number
  onStep: (nextIndex: number) => void
}

export function VersionStrip({ count, index, onStep }: VersionStripProps) {
  const { t } = useTranslation()
  // One run is not a history — the strip appears only once there is a choice.
  if (count < 2) return null
  return (
    <div className="mb-2 flex items-center justify-end gap-1 text-[11px] text-mist-dim">
      <button
        type="button"
        aria-label={t('canvas.node.prevVersion')}
        disabled={index === 0}
        onClick={() => onStep(index - 1)}
        className="nodrag rounded px-1 hover:text-mist focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none disabled:opacity-40"
      >
        <span aria-hidden="true">‹</span>
      </button>
      <span>{t('canvas.node.version', { index: index + 1, count })}</span>
      <button
        type="button"
        aria-label={t('canvas.node.nextVersion')}
        disabled={index === count - 1}
        onClick={() => onStep(index + 1)}
        className="nodrag rounded px-1 hover:text-mist focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none disabled:opacity-40"
      >
        <span aria-hidden="true">›</span>
      </button>
    </div>
  )
}
