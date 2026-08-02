// apps/web/src/modules/Gallery/components/GalleryFilterBar.tsx
// The feed's filter header: type (all/images/videos) → model → aspect ratio.
//
// WHY MODELS ARRIVE AS A PROP: the model catalog belongs to modules/Generator.
// Gallery importing it would be a cross-module import (architecture law). The
// route already holds the catalog for the composer, so it passes the names down
// — Gallery stays presentational and knows nothing about pricing or providers.
//
// All three are the SAME Select: eight models (a growing set) can never be a
// pill row without wrapping onto a second line and stealing vertical space the
// media should own — and once one control is a dropdown, a neighbouring pill row
// just reads as an inconsistency.
import { useTranslation } from 'react-i18next'
import type { AspectRatio } from '@opencreate/contracts'
import { Button, Select } from 'shared/ui'
import type { GalleryFilter } from './GalleryGrid'

// A model as the feed needs it — id to match generations, name to show.
// Deliberately NOT CatalogModel: the filter has no business seeing prices.
export type GalleryModelOption = { id: string; name: string }

export type GalleryFilters = {
  // Media type; 'all' disables the type filter
  type: GalleryFilter
  // Selected model id, or null for "any model"
  modelId: string | null
  // Selected aspect ratio, or null for "any ratio"
  aspectRatio: AspectRatio | null
}

export type GalleryFilterBarProps = {
  // Current filters — the owning route keeps them in local state
  value: GalleryFilters
  // Called with the FULL next filter object (never a partial patch)
  onChange: (filters: GalleryFilters) => void
  // Models offered in the model dropdown, injected by the route
  models: GalleryModelOption[]
}

const ASPECT_OPTIONS: AspectRatio[] = ['16:9', '1:1', '9:16']

// '' is the "any" sentinel on the wire of a <select>. It is normalized back to
// null at the boundary so GalleryGrid never has to tell an empty string apart
// from an unset filter — one representation of "no filter", not two.
const ANY = ''

// The "nothing selected" shape. Kept next to the bar rather than imported from the
// route: the reset button below has to know what empty MEANS, and a second copy of
// that definition drifting from the route's INITIAL_FILTERS would produce a reset
// that quietly leaves one dropdown set.
const EMPTY_FILTERS: GalleryFilters = { type: 'all', modelId: null, aspectRatio: null }

export function GalleryFilterBar({ value, onChange, models }: GalleryFilterBarProps) {
  const { t } = useTranslation()

  // Derived, never state: a `useState` mirror of "is anything filtered" would be a
  // second source of truth that can disagree with the props it was computed from.
  const isFiltered =
    value.type !== EMPTY_FILTERS.type ||
    value.modelId !== null ||
    value.aspectRatio !== null

  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end sm:gap-3">
      <Select
        label={t('gallery.filter.label')}
        options={[
          { value: 'all', label: t('gallery.filter.all') },
          { value: 'image', label: t('gallery.filter.images') },
          { value: 'video', label: t('gallery.filter.videos') },
        ]}
        value={value.type}
        onChange={(type: GalleryFilter) => onChange({ ...value, type })}
      />

      <div className="min-w-0 sm:max-w-48 sm:flex-1">
        <Select
          label={t('gallery.filter.model')}
          options={[
            { value: ANY, label: t('gallery.filter.anyModel') },
            ...models.map((model) => ({ value: model.id, label: model.name })),
          ]}
          value={value.modelId ?? ANY}
          onChange={(modelId) => onChange({ ...value, modelId: modelId || null })}
        />
      </div>

      <Select
        label={t('gallery.filter.aspect')}
        options={[
          { value: ANY, label: t('gallery.filter.anyAspect') },
          // The ratio string is its own universal label — not translated
          ...ASPECT_OPTIONS.map((ratio) => ({ value: ratio, label: ratio })),
        ]}
        value={value.aspectRatio ?? ANY}
        onChange={(aspectRatio) =>
          onChange({ ...value, aspectRatio: aspectRatio === ANY ? null : aspectRatio })
        }
      />

      {/* CONDITIONAL, and that is the whole design. All three controls are
          dropdowns whose "any" option is easy to miss, so a narrowed feed reads as
          an empty one and the way back is not obvious. A single reset fixes that —
          but shown permanently it would be a control that does nothing on most
          visits, which is exactly how people learn to stop seeing it.

          Ghost variant and last in the row: it is the escape hatch, not a peer of
          the filters themselves. `self-end` keeps its baseline on the selects,
          which carry a label above their control. */}
      {isFiltered ? (
        <Button
          variant="ghost"
          onClick={() => onChange(EMPTY_FILTERS)}
          className="col-span-2 self-end sm:col-span-1"
        >
          {t('gallery.filter.reset')}
        </Button>
      ) : null}
    </div>
  )
}
