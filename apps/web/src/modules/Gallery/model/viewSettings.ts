// apps/web/src/modules/Gallery/model/viewSettings.ts
// How the library is DISPLAYED — grid / table / slide, and how dense the grid
// is. Deliberately separate from the filter state (which lives in the route):
// filters answer "what am I looking at", view settings answer "how do I like to
// look at it". The first is per-visit and belongs to the screen; the second is
// a lasting preference and belongs to the user.
//
// Hence `persist`: a chosen density that resets on every reload is a setting
// the user has to re-make forever, which teaches them not to bother touching it.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Three ways to read the same feed:
//  grid  — the default contact sheet; scan many at once
//  table — dense rows with metadata; compare model/format/cost across runs
//  slide — one large frame at a time; judge a single result properly
export type GalleryView = 'grid' | 'table' | 'slide'

// Card size in grid view. Not pixel values — column counts per breakpoint, so
// "large" stays large on a laptop and does not become a single lonely column.
export type GridSize = 'sm' | 'md' | 'lg'

export type ViewSettingsState = {
  view: GalleryView
  gridSize: GridSize
  setView: (view: GalleryView) => void
  setGridSize: (gridSize: GridSize) => void
}

// Bumping this key discards previously persisted settings. Do that only on a
// breaking shape change — a silent reset of everyone's preference is a cost.
const STORAGE_KEY = 'opencreate.gallery.view'

export const useViewSettings = create<ViewSettingsState>()(
  persist(
    (set) => ({
      view: 'grid',
      gridSize: 'md',
      setView: (view) => set({ view }),
      setGridSize: (gridSize) => set({ gridSize }),
    }),
    { name: STORAGE_KEY },
  ),
)

// Column ramps per density. Every ramp keeps a sane floor on phones (never more
// than 2 columns of media on a 375px screen) and only diverges as space appears.
export const GRID_SIZE_CLASSES: Record<GridSize, string> = {
  sm: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-7',
  md: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4',
  lg: 'grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3',
}
