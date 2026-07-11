// apps/web/src/modules/Templates/components/TemplateCard.tsx
// One template in the gallery grid.
//
// THE HONEST-POSTER PROBLEM. This product is media-first, and a catalog of video
// templates with no video on the cards is a bad hand. The tempting move is a grey
// placeholder box, or a stock-looking gradient with a play triangle on it. Both
// are lies: they promise a preview and deliver a rectangle, and the user learns
// the cards are noise.
//
// So the poster is TYPOGRAPHIC and every mark on it is information:
//   · the tagline is the format's premise, in one line — the actual pitch;
//   · the beat strip is the film's real shape, with the free beats visibly hollow;
//   · the price shown is the CHEAPEST tier, because that is the number that
//     decides whether someone even opens the card.
// When previewUrl lands (a real render of this template), it takes over the plate
// and all of this becomes the caption. The seam is already here.
//
// The plate is 4:5 rather than the true 9:16 of the output: a real 9:16 poster in
// a four-across grid is a column of slivers. 4:5 still reads as vertical without
// making the grid unusable, and the actual aspect is stated in the meta row.
import { useTranslation } from 'react-i18next'
import type { TemplateSummary } from '@opencreate/contracts'
import { Card } from 'shared/ui'
import { BeatStrip } from './BeatSheet'

export type TemplateCardProps = {
  template: TemplateSummary
  onOpen: (template: TemplateSummary) => void
}

export function TemplateCard({ template, onOpen }: TemplateCardProps) {
  const { t } = useTranslation()

  // The number that decides whether the card is worth opening.
  const cheapest = template.tiers.reduce(
    (min, tier) => (tier.credits < min ? tier.credits : min),
    Number.POSITIVE_INFINITY,
  )

  return (
    <Card padding="none" className="h-full overflow-hidden">
      <button
        type="button"
        onClick={() => onOpen(template)}
        className="group flex h-full w-full flex-col text-left focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
      >
        {/* The poster plate */}
        <div className="relative flex aspect-4/5 flex-col justify-between overflow-hidden bg-abyss p-5">
          {template.previewUrl ? (
            <video
              src={template.previewUrl}
              muted
              loop
              playsInline
              className="absolute inset-0 size-full object-cover"
            />
          ) : (
            // Not decoration: an amber wash that ties the card to the amber
            // "generated beat" language used by the strip and the tier pills.
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-linear-to-b from-specimen-amber/12 via-transparent to-transparent transition-opacity duration-300 group-hover:opacity-70"
            />
          )}

          <div className="relative flex items-center gap-2">
            <span className="rounded-full border border-white/10 bg-abyss/60 px-2 py-0.5 text-xs text-mist-dim">
              {template.aspectRatio}
            </span>
            {template.hasVoiceover ? (
              <span className="rounded-full border border-white/10 bg-abyss/60 px-2 py-0.5 text-xs text-mist-dim">
                {t('templates.card.voiced')}
              </span>
            ) : null}
          </div>

          <div className="relative flex flex-col gap-2">
            <h3 className="text-2xl leading-tight font-normal text-white">{template.name}</h3>
            <p className="text-sm text-mist-dim">{template.tagline}</p>
          </div>
        </div>

        {/* The caption: shape, then price */}
        <div className="flex flex-col gap-3 border-t border-white/10 p-4">
          <BeatStrip beats={template.beats} />
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs text-mist-dim">
              {t('templates.card.shape', {
                beats: template.shotCount,
                seconds: template.totalDurationSeconds,
              })}
            </span>
            <span className="text-xs whitespace-nowrap text-mist tabular-nums">
              {t('templates.card.from', { count: cheapest })}
            </span>
          </div>
        </div>
      </button>
    </Card>
  )
}
