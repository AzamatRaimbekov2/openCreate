// apps/web/src/modules/Gallery/index.ts
// Public API of the Gallery module — routes import ONLY from 'modules/Gallery'.
// Internal files (model/, per-card components) are private; polling and delete
// stay encapsulated behind the grid.
export { GalleryFilterChips } from './components/GalleryFilterChips'
export type { GalleryFilterChipsProps } from './components/GalleryFilterChips'
// The /create feed's full filter header (type + model + aspect). The model list
// is injected by the route — Gallery must not reach into the Generator catalog.
export { GalleryFilterBar } from './components/GalleryFilterBar'
export type {
  GalleryFilterBarProps,
  GalleryFilters,
  GalleryModelOption,
} from './components/GalleryFilterBar'
// The gear popover holding view mode + grid density. It reads/writes the
// persisted viewSettings store directly, so the route just places it.
export { ViewSettingsMenu } from './components/ViewSettingsMenu'
export { GalleryGrid } from './components/GalleryGrid'
export type { GalleryFilter, GalleryGridProps } from './components/GalleryGrid'
