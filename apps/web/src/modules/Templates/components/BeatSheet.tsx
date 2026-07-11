// apps/web/src/modules/Templates/components/BeatSheet.tsx
// A template's structure, drawn two ways.
//
// This is the closest thing the gallery has to a preview, and it is doing real
// work — not decoration. We have no rendered example of a template yet
// (previewUrl is null), and a grey box pretending to be a video would be worse
// than nothing. But a template's SHAPE is its most useful fact: "nine beats, the
// last one free, sixty-six seconds" tells you more about whether you want this
// than a thumbnail would.
//
// `BeatStrip` is the compact form for a card: one block per beat, width
// proportional to its duration, amber for a generated clip and a hollow hairline
// for a free title card. The reader can see the shape of the film at a glance —
// and can literally see which beats cost money.
//
// `BeatList` is the expanded form for the detail modal: the same data, named.
import type { TemplateBeat } from '@opencreate/contracts'
import { useTranslation } from 'react-i18next'

export type BeatStripProps = {
  beats: TemplateBeat[]
}

export function BeatStrip({ beats }: BeatStripProps) {
  const total = beats.reduce((sum, b) => sum + b.durationSeconds, 0)

  return (
    // aria-hidden: the strip is a visual restatement of the beat count and
    // duration, both of which are announced as text right next to it. A screen
    // reader walking nine unlabelled divs learns nothing.
    <div aria-hidden="true" className="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full">
      {beats.map((beat, index) => (
        <div
          key={`${beat.label}-${String(index)}`}
          style={{ flexGrow: beat.durationSeconds / total }}
          className={
            beat.generated
              ? 'rounded-full bg-specimen-amber/70'
              : 'rounded-full border border-white/20 bg-transparent'
          }
        />
      ))}
    </div>
  )
}

export type BeatListProps = {
  beats: TemplateBeat[]
}

export function BeatList({ beats }: BeatListProps) {
  const { t } = useTranslation()

  return (
    <ol className="flex flex-col divide-y divide-white/10 rounded-lg border border-white/10">
      {beats.map((beat, index) => (
        <li
          key={`${beat.label}-${String(index)}`}
          className="flex items-center justify-between gap-3 px-3 py-2"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="w-4 shrink-0 text-right text-xs text-mist-dim/60">{index + 1}</span>
            <span className="truncate text-sm text-mist">{beat.label}</span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {/* A free beat is worth calling out — it is why the card can say
                "9 beats" and the price only multiplies by 8. */}
            {beat.generated ? null : (
              <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-mist-dim">
                {t('templates.beat.free')}
              </span>
            )}
            <span className="text-xs text-mist-dim tabular-nums">
              {t('templates.beat.seconds', { count: beat.durationSeconds })}
            </span>
          </span>
        </li>
      ))}
    </ol>
  )
}
