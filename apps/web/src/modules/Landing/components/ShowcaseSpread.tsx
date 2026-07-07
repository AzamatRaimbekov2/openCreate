// apps/web/src/modules/Landing/components/ShowcaseSpread.tsx
// "Selected works" — the magazine spread of poster-grade ShowcasePoster art
// that replaces the rejected v1 gradient placeholders. Six deliberate
// compositions in an asymmetric 12-col grid (varied spans, one tall 9:16, one
// full-width plate), each with an honest editorial figure caption:
// `fig. 0N — “title” · Model (provider)` plus the "sample style" stamp so we
// never imply these are real user generations (copy rules, design.md §5).
import { useTranslation } from 'react-i18next'
import { Badge, ShowcasePoster } from 'shared/ui'
import type { ShowcasePalette } from 'shared/ui'
import { SectionHeading } from './SectionHeading'

type ShowcaseItem = {
  // Palette id doubles as the i18n segment: landing.showcase.items.<id>.title
  id: ShowcasePalette
  // Honest catalog model behind the style — product name (real provider);
  // proper nouns, deliberately NOT translated
  model: string
  // Grid span + vertical offset — the asymmetry that makes it a spread
  frameClass: string
  // Aspect ratio of the cropped poster window (posters slice-crop to any box)
  aspectClass: string
  // Exactly one card is marked as a 5-second video sample
  isVideo?: boolean
}

// Reading order = fig. 01…06. Spans compose a 12-col magazine spread:
// row 1 → 7+5, row 2 → 4(tall)+4+4, row 3 → full-width closing plate.
// Image posters carry the image models (Flash/Studio); the one video-marked
// poster carries a real video model (Cinema = Wan 2.7).
const SHOWCASE_ITEMS: readonly ShowcaseItem[] = [
  {
    id: 'koi',
    model: 'Studio (FLUX dev)',
    frameClass: 'md:col-span-7',
    aspectClass: 'aspect-[4/3]',
  },
  {
    id: 'sea',
    model: 'Cinema (Wan 2.7)',
    frameClass: 'md:col-span-5 md:mt-12',
    aspectClass: 'aspect-[4/5]',
    isVideo: true,
  },
  {
    id: 'ultraviolet',
    model: 'Studio (FLUX dev)',
    frameClass: 'md:col-span-4',
    aspectClass: 'aspect-[9/16]',
  },
  {
    id: 'botanical',
    model: 'Flash (FLUX schnell)',
    frameClass: 'md:col-span-4 md:mt-10',
    aspectClass: 'aspect-[4/5]',
  },
  {
    id: 'mono',
    model: 'Flash (FLUX schnell)',
    frameClass: 'md:col-span-4',
    aspectClass: 'aspect-[4/5]',
  },
  {
    id: 'dusk',
    model: 'Studio (FLUX dev)',
    frameClass: 'md:col-span-12',
    aspectClass: 'aspect-[4/3] md:aspect-[21/9]',
  },
]

export function ShowcaseSpread() {
  const { t } = useTranslation()

  return (
    <section className="flex flex-col gap-10">
      <SectionHeading
        ordinal="01"
        kicker={t('landing.showcase.kicker')}
        title={t('landing.showcase.title')}
      />
      <div className="grid grid-cols-1 gap-x-6 gap-y-12 md:grid-cols-12">
        {SHOWCASE_ITEMS.map((item, index) => (
          <figure key={item.id} className={`flex flex-col gap-3 ${item.frameClass}`}>
            {/* Poster window: crops the 4:5 art to the card's aspect; hover is
                a FELT print-lift — ≤1deg tilt + tiny scale, motion-safe only */}
            <div
              className={`relative overflow-hidden rounded-lg transition-transform duration-200 motion-safe:hover:-rotate-[0.6deg] motion-safe:hover:scale-[1.015] ${item.aspectClass}`}
            >
              <ShowcasePoster palette={item.id} className="h-full w-full" />
              {item.isVideo ? (
                // The video sample marker: a mono caption chip (Badge voice)
                // on a void/80 backing so it stays legible on any art; amber =
                // the triad's "explore/highlight" tint. The play triangle is
                // decorative — the localized text carries the meaning.
                <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-void/80 px-2.5 py-0.5 text-xs font-medium text-glow-amber">
                  <svg aria-hidden="true" viewBox="0 0 8 8" className="h-2 w-2 fill-current">
                    <path d="M1 0l6 4-6 4Z" />
                  </svg>
                  {t('landing.showcase.videoMarker')}
                </span>
              ) : null}
            </div>
            {/* Figure caption in the quiet mono voice: fig number — honest
                sample title — the REAL model behind the style + sample chip */}
            <figcaption className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-mist-dim">
              <span className="text-sm text-mist">
                {t('landing.showcase.figure', {
                  // Position in reading order, not a key — spread numbering
                  number: String(index + 1).padStart(2, '0'),
                })}
              </span>
              <span>— {t(`landing.showcase.items.${item.id}.title`)}</span>
              <span>· {item.model}</span>
              <Badge>{t('landing.showcase.sampleLabel')}</Badge>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}
