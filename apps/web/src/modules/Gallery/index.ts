// apps/web/src/modules/Gallery/index.ts
// Public API of the Gallery module — routes import ONLY from 'modules/Gallery'.
// Internal files (model/, per-card components) are private; polling and delete
// stay encapsulated behind the grid.
export { GalleryFilterChips } from './components/GalleryFilterChips'
export type { GalleryFilterChipsProps } from './components/GalleryFilterChips'
export { GalleryGrid } from './components/GalleryGrid'
export type { GalleryFilter, GalleryGridProps } from './components/GalleryGrid'
