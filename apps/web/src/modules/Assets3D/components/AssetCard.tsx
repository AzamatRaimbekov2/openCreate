// apps/web/src/modules/Assets3D/components/AssetCard.tsx
// One modular asset in the library grid: a glass Card whose picture area is a
// recessed WELL plate holding the concept image (the FilmCard silhouette, with
// real media instead of a glyph).
//
// The concept image is CONTENT, not chrome — so it sits in `Card surface="well"
// padding="none"` and never in glass. Frosting a card around the picture the user
// uploaded lays a lit edge, a blur and a shadow over the thing their eye is
// actually reading (design.md §3.5, the GenerationCard rule).
//
// The whole card is a typed <Link> into the wizard; the hover lift lives on the
// link so the Card's surface classes stay untouched.
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import type { Asset3d } from '@opencreate/contracts'
import { Card } from 'shared/ui'

export type AssetCardProps = {
  // The asset to render (list payload — parts are not in it)
  asset: Asset3d
}

export function AssetCard({ asset }: AssetCardProps) {
  const { t, i18n } = useTranslation()
  // Localized short date for the caption; the ISO string stays the source
  const created = new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(asset.createdAt))

  return (
    <Link
      to="/assets/$assetId"
      params={{ assetId: asset.id }}
      className="group block rounded-2xl transition-transform duration-200 focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none motion-safe:hover:-translate-y-0.5"
    >
      <Card className="flex h-full flex-col gap-3">
        <Card surface="well" padding="none" className="aspect-square w-full overflow-hidden">
          {/* The concept is always present on a stored asset (the API refuses a
              create without one), so there is no "no image" branch to fake here.
              object-cover: the grid is a shelf of equal plates, and the wizard
              shows the full frame. */}
          <img
            src={asset.conceptImageUrl}
            alt={t('assets3d.library.conceptAlt', { title: asset.title })}
            className="size-full object-cover"
          />
        </Card>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">{asset.title}</p>
          <p className="text-xs text-mist-dim">
            {t('assets3d.library.created', { date: created })}
          </p>
        </div>
      </Card>
    </Link>
  )
}
