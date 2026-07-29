// apps/web/src/modules/Compare/components/GenerationPanel.tsx
// One contender's column on the /compare page — renders its PanelResult
// through the 4 mandatory UI states (empty / loading / error / success),
// fully channel-blind: everything channel-specific (units, labels) arrives
// pre-formatted in props so this component never branches on provider.
import { ErrorState, Skeleton } from 'shared/ui'
import type { PanelResult } from '../model/types'

export type GenerationPanelProps = {
  // Model's public name (panel header)
  label: string
  // Which pipe the render travels — sublabel under the header
  channel: string
  result: PanelResult
  // Shared run stopwatch (seconds) shown during loading against the 120s cap
  elapsedSeconds: number
  // Re-runs ONLY this contender (spec: independent retry)
  onRetry: () => void
}

export function GenerationPanel({
  label,
  channel,
  result,
  elapsedSeconds,
  onRetry,
}: GenerationPanelProps) {
  return (
    <section aria-label={label} className="flex flex-col gap-3">
      <header className="flex flex-col">
        <h3 className="text-sm font-medium text-white">{label}</h3>
        <span className="text-xs text-mist-dim">{channel}</span>
      </header>

      {result.status === 'empty' ? (
        // Empty: quiet hairline placeholder, same silhouette as the eventual
        // image so the grid doesn't jump when results land
        <div className="flex aspect-square items-center justify-center rounded-lg border border-white/10 text-sm text-mist-dim">
          Ready to generate
        </div>
      ) : result.status === 'loading' ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="aspect-square w-full" />
          {/* Elapsed vs the 120s server timeout — the page's whole purpose is
              this number, so it is visible during the wait, not only after */}
          <span aria-live="polite" className="text-xs text-mist-dim">
            {elapsedSeconds}s / 120s
          </span>
        </div>
      ) : result.status === 'error' ? (
        // ErrorState brings the calm hairline frame + localized retry button;
        // the message is already user-safe (API envelopes are sanitized)
        <ErrorState message={result.error ?? 'Generation failed'} onRetry={onRetry} />
      ) : (
        <figure className="flex flex-col gap-2">
          <img
            src={result.imageUrl}
            alt={`${label} result`}
            className="aspect-square w-full rounded-lg object-cover"
          />
          {/* The comparison readout: wall time + what it cost, side by side */}
          <figcaption className="flex gap-4 text-xs text-mist-dim">
            {result.durationMs !== undefined ? (
              <span>{(result.durationMs / 1000).toFixed(1)}s</span>
            ) : null}
            {result.costLabel !== undefined ? <span>{result.costLabel}</span> : null}
          </figcaption>
        </figure>
      )}
    </section>
  )
}
