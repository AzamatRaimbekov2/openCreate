// apps/web/src/modules/Gallery/components/GalleryFilterChips.tsx
// Type filter chips for the library page (all / images / videos) — a localized
// wrapper over the shared PillGroup; the route owns the selected value.
import { useTranslation } from 'react-i18next'
import { PillGroup } from 'shared/ui'
import type { GalleryFilter } from './GalleryGrid'

export type GalleryFilterChipsProps = {
  // Current filter — the owning route keeps it in local state
  value: GalleryFilter
  // Called with the clicked filter
  onChange: (filter: GalleryFilter) => void
}

export function GalleryFilterChips({ value, onChange }: GalleryFilterChipsProps) {
  const { t } = useTranslation()
  return (
    <PillGroup
      label={t('gallery.filter.label')}
      options={[
        { value: 'all', label: t('gallery.filter.all') },
        { value: 'image', label: t('gallery.filter.images') },
        { value: 'video', label: t('gallery.filter.videos') },
      ]}
      value={value}
      onChange={onChange}
    />
  )
}
