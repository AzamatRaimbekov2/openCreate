// apps/web/src/modules/Landing/components/ShowcaseSpread.tsx
// "Selected works" (v3 Stage 2): the specimen grid — eight blue-violet duotone
// SVG plates (eye/brain/hand/arch/moon symbolism family) in a square 4-col
// grid (2-col on phones), 8px gap + radius + subtle fog border. Chrome stays
// minimal per the reference: NO per-tile magazine captions — ONE small mono
// caption under the grid carries the honest "sample style" label and names the
// REAL catalog models behind the product (copy rules, design.md §5). Exactly
// one tile (the moon) is marked as a 5-second video sample.
import { useTranslation } from 'react-i18next'
import { Badge, SpecimenTile } from 'shared/ui'
import type { SpecimenKind } from 'shared/ui'
import { SectionHeading } from './SectionHeading'

type ShowcaseTile = {
  // Which specimen plate fills the cell (also the stable React key)
  kind: SpecimenKind
  // Exactly one tile is marked as a 5-second video sample
  isVideo?: boolean
}

// Reading order of the 4×2 grid. The moon carries the video mark — the one
// cinematic plate in the set; everything else reads as image samples.
const SHOWCASE_TILES: readonly ShowcaseTile[] = [
  { kind: 'eye' },
  { kind: 'brain' },
  { kind: 'hand' },
  { kind: 'arch' },
  { kind: 'moon', isVideo: true },
  { kind: 'koi' },
  { kind: 'cell' },
  { kind: 'orbit' },
]

export function ShowcaseSpread() {
  const { t } = useTranslation()

  return (
    <section className="flex flex-col gap-8">
      <SectionHeading kicker={t('landing.showcase.kicker')} title={t('landing.showcase.title')} />
      {/* ONE figure for the whole grid: the caption below labels the set
          honestly in a single quiet line (reference: minimal chrome) */}
      <figure className="flex flex-col gap-3">
        {/* Square tiles, 8px gap (gap-2) + 8px radius + white/10 fog border —
            the reference's specimen-grid geometry verbatim */}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {SHOWCASE_TILES.map((tile) => (
            <div
              key={tile.kind}
              className="relative aspect-square overflow-hidden rounded-lg border border-white/10"
            >
              <SpecimenTile kind={tile.kind} className="h-full w-full" />
              {tile.isVideo ? (
                // The video sample marker: a mono caption chip on a void/80
                // backing so it stays legible on the art; amber = the triad's
                // "explore/highlight" tint. The play triangle is decorative —
                // the localized text carries the meaning.
                <span className="absolute top-2 left-2 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-void/80 px-2.5 py-0.5 text-xs font-medium text-glow-amber">
                  <svg aria-hidden="true" viewBox="0 0 8 8" className="h-2 w-2 fill-current">
                    <path d="M1 0l6 4-6 4Z" />
                  </svg>
                  {t('landing.showcase.videoMarker')}
                </span>
              ) : null}
            </div>
          ))}
        </div>
        {/* The one honest caption: the "sample style" chip + the real models —
            we never imply these plates are user generations */}
        <figcaption className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-mist-dim">
          <Badge>{t('landing.showcase.sampleLabel')}</Badge>
          <span>{t('landing.showcase.caption')}</span>
        </figcaption>
      </figure>
    </section>
  )
}
