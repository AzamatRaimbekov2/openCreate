// apps/web/src/modules/Cinema/components/FilmCard.tsx
// One film in the library grid: a figure on a SQUARE-ish abyss plate (the same
// tile language as Gallery cards and the landing specimens) sized to the film's
// canvas aspect, with the title + aspect chip + "updated" caption below. The
// whole plate is a typed <Link> into the editor — a film has no cover image in
// the list payload, so the plate carries a quiet film glyph instead of media.
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import type { AspectRatio, Film } from '@opencreate/contracts'
import { Badge } from 'shared/ui'
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
      className="group flex flex-col gap-2 rounded-lg focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
    >
      {/* Media well: recessed abyss plate, canvas-shaped, lifts a hair on hover */}
      <div
        className={`grid w-full place-items-center overflow-hidden rounded-lg border border-white/10 bg-abyss text-mist-dim/50 transition-transform duration-200 motion-safe:group-hover:-translate-y-0.5 ${ASPECT_CLASS[film.aspectRatio]}`}
      >
        <TextCardIcon className="size-8" />
      </div>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">{film.title}</p>
          <p className="text-xs text-mist-dim">{t('cinema.card.updated', { date: updated })}</p>
        </div>
        <Badge>{film.aspectRatio}</Badge>
      </div>
    </Link>
  )
}
