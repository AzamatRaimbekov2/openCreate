// apps/web/src/modules/Cinema/components/FilmCard.tsx
// One film in the library grid. v4: a glass `Card` whose picture area is a
// recessed `well` plate sized to the film's canvas — so the grid reads as a shelf
// of physical cards rather than a row of bare tiles floating on the void, and the
// two surfaces (frosted card, sunken plate) do the depth work that a shadow-less
// v3 tile could not. Since 2026-07-31 a film CAN carry a cover (picked when it is
// created), so the plate shows that picture when there is one and falls back to
// the quiet film glyph when there is not — the shelf reads as covers, not as a
// row of identical glyphs, the moment a user starts giving their films faces.
// The whole card is a typed <Link> into the editor; the lift on hover lives on
// the link, so the Card keeps its surface styling untouched.
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import type { AspectRatio, Film } from '@opencreate/contracts'
import { Badge, Card } from 'shared/ui'
import { TextCardIcon } from './icons'

// Map the film canvas to a Tailwind aspect utility so the plate previews the
// real output shape (a vertical film reads as a tall tile, not a square lie).
const ASPECT_CLASS: Record<AspectRatio, string> = {
  '16:9': 'aspect-video',
  '1:1': 'aspect-square',
  '9:16': 'aspect-[9/16]',
}

export type FilmCardProps = {
  // The film to render (list payload — no shots/audio here)
  film: Film
}

export function FilmCard({ film }: FilmCardProps) {
  const { t, i18n } = useTranslation()
  // Localized short date for the "updated" caption; the ISO string is the source
  const updated = new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(film.updatedAt))

  return (
    <Link
      to="/cinema/$filmId"
      params={{ filmId: film.id }}
      className="group block rounded-2xl transition-transform duration-200 focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none motion-safe:hover:-translate-y-0.5"
    >
      <Card className="flex h-full flex-col gap-3">
        {/* Media well: recessed plate, canvas-shaped. The cover fills it
            (object-cover — the plate's job is to preview the film's SHAPE, so the
            picture crops to it rather than letterboxing inside it); with no cover
            the plate keeps its box and carries the glyph, so a mixed shelf never
            reflows. */}
        <Card
          surface="well"
          padding="none"
          className={`grid w-full place-items-center overflow-hidden text-mist-dim/50 ${ASPECT_CLASS[film.aspectRatio]}`}
        >
          {film.coverUrl ? (
            <img src={film.coverUrl} alt={film.title} className="size-full object-cover" />
          ) : (
            <TextCardIcon className="size-8" />
          )}
        </Card>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">{film.title}</p>
            <p className="text-xs text-mist-dim">{t('cinema.card.updated', { date: updated })}</p>
          </div>
          <Badge>{film.aspectRatio}</Badge>
        </div>
      </Card>
    </Link>
  )
}
