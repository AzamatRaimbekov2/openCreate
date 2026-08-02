// apps/web/src/modules/Compare/components/VideoCostPanel.tsx
// One channel's receipt on the /compare-video page: the clip, what the provider
// billed, and how long it took.
//
// THE RULE THIS COMPONENT ENFORCES. It renders ONLY figures the server sent. There
// is no rate card here, no per-second multiplication, no "estimated" fallback —
// because the page exists precisely because rate-card arithmetic kept producing
// confident wrong answers. A null cost renders as "provider stated no figure",
// which is information, not a hole to fill.
import { useTranslation } from 'react-i18next'
import { errorCodeMessageKey } from 'shared/libs/errorCopy'
import type { CompareVideoPanel } from '../model/videoTypes'

export type VideoCostPanelProps = {
  panel: CompareVideoPanel
  // Cheapest SUCCESSFUL panel of the run, computed by the page across both
  // channels. Drives the winner accent; absent when nothing settled with a cost.
  isCheapest: boolean
  // Cost per second, derived by the page from THIS panel's own billed total and
  // the run's duration — an honest division of two server numbers, never a rate.
  perSecondUsd: number | null
}

// Enough decimals that a sub-cent difference stays visible: at $0.0175/s a 2-digit
// rounding would print $0.02 for both channels and erase the entire finding.
function formatUsd(value: number): string {
  if (value >= 10) return `$${value.toFixed(2)}`
  if (value >= 1) return `$${value.toFixed(3)}`
  return `$${value.toFixed(4)}`
}

export function VideoCostPanel({ panel, isCheapest, perSecondUsd }: VideoCostPanelProps) {
  const { t } = useTranslation()
  const isError = panel.status === 'error'

  return (
    <article
      className={`flex flex-col gap-4 rounded-lg border p-5 ${
        isCheapest ? 'border-emerald-400/40 bg-emerald-400/[0.03]' : 'border-white/10'
      }`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium text-white">{panel.label}</h2>
          <span className="font-mono text-xs text-mist-dim">{panel.channel}</span>
        </div>
        {isCheapest ? (
          <span className="rounded-full border border-emerald-400/40 px-2 py-0.5 text-xs text-emerald-300">
            дешевле
          </span>
        ) : null}
      </header>

      {/* ERROR state. A channel that refused the job still renders its panel —
          "this provider would not run it" is a comparison result, and on this page
          it is often the ANSWER (an unset key, a drained balance).

          Copy comes from the SHARED code→i18n layer, never from the server's prose.
          Styling is deliberately calm rather than red: this is an expected outcome on
          a measurement page, not an emergency, and the frontend-error-ux rules forbid
          alarming failure UI. `role="status"` (not "alert") for the same reason — the
          operator asked for this result by pressing the button. */}
      {isError ? (
        <p
          role="status"
          className="rounded border border-white/10 bg-white/[0.03] p-3 text-sm text-mist-dim"
        >
          {t(errorCodeMessageKey(panel.errorCode))}
        </p>
      ) : null}

      {/* SUCCESS state: the clip itself, so the money figure can be judged against
          what it actually bought. `controls` and no autoplay — an operator page
          must not start two videos at once. */}
      {!isError && panel.videoUrl ? (
        <video
          src={panel.videoUrl}
          controls
          playsInline
          preload="metadata"
          className="aspect-video w-full rounded border border-white/10 bg-black"
        />
      ) : null}

      {/* Succeeded but delivered nothing — a real provider outcome, and one that
          still costs money, so it must not look like an empty panel. */}
      {!isError && !panel.videoUrl ? (
        <p
          role="status"
          className="rounded border border-white/10 bg-white/[0.03] p-3 text-sm text-mist-dim"
        >
          Канал завершил работу, но файл не пришёл. Сумма всё равно списана.
        </p>
      ) : null}

      <dl className="flex flex-col gap-2 border-t border-white/10 pt-4 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-mist-dim">Списано</dt>
          <dd className="font-mono tabular-nums text-white">
            {panel.costUsd === null ? (
              <span className="text-mist-dim">провайдер не назвал сумму</span>
            ) : (
              formatUsd(panel.costUsd)
            )}
          </dd>
        </div>

        {/* kie.ai only: their raw credit count next to the dollars, so the $0.005
            conversion on screen can be checked against their dashboard instead of
            trusted. DeepInfra bills USD directly and has no such row. */}
        {panel.creditsConsumed !== null ? (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-mist-dim">Кредитов</dt>
            <dd className="font-mono tabular-nums text-white">
              {panel.creditsConsumed}
              <span className="ml-1 text-mist-dim">× $0.005</span>
            </dd>
          </div>
        ) : null}

        {perSecondUsd !== null ? (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-mist-dim">За секунду</dt>
            <dd className="font-mono tabular-nums text-white">{formatUsd(perSecondUsd)}/с</dd>
          </div>
        ) : null}

        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-mist-dim">Время</dt>
          <dd className="font-mono tabular-nums text-white">
            {(panel.durationMs / 1000).toFixed(1)} с
          </dd>
        </div>
      </dl>
    </article>
  )
}
