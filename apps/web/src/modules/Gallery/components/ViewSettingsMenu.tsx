// apps/web/src/modules/Gallery/components/ViewSettingsMenu.tsx
// The gear: a disclosure popover holding the library's DISPLAY preferences
// (grid / table / slide, and grid density).
//
// WHY BEHIND A GEAR AND NOT IN THE FILTER BAR: filters change what you see and
// get touched constantly; view settings change how you see it and get touched
// once. Putting a rarely-used control next to a constantly-used one costs the
// frequent control space on every screen, forever.
//
// The disclosure follows AppShell's UserMenu pattern exactly (aria-haspopup +
// aria-expanded, an invisible click-away layer, Escape to close) — one popover
// idiom in the app, no dependency for two radio groups.
import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { PillGroup } from 'shared/ui'
import type { GalleryView, GridSize } from '../model/viewSettings'
import { useViewSettings } from '../model/viewSettings'

export function ViewSettingsMenu() {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const view = useViewSettings((state) => state.view)
  const gridSize = useViewSettings((state) => state.gridSize)
  const setView = useViewSettings((state) => state.setView)
  const setGridSize = useViewSettings((state) => state.setGridSize)

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') setIsOpen(false)
  }

  return (
    <div className="relative" onKeyDown={handleKeyDown}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={t('gallery.view.label')}
        onClick={() => setIsOpen((prev) => !prev)}
        // Chrome, not a call to action: quiet until hovered, like UserMenu
        className="flex size-10 items-center justify-center rounded-full text-mist-dim transition-colors duration-200 hover:bg-ridge hover:text-white focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
      >
        {/* Inline currentColor gear — never an OS emoji (closed icon triad) */}
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-5"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {isOpen ? (
        <>
          {/* Click-away layer (same pattern as Modal's overlay / UserMenu) */}
          <div role="presentation" className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          {/* Panel = a ridge surface step with a white/10 hairline — elevation
              by color, no shadow. right-0 keeps it inside the viewport when the
              gear sits at the header's right edge. */}
          <div
            role="menu"
            aria-label={t('gallery.view.label')}
            className="absolute top-full right-0 z-20 mt-2 flex w-64 flex-col gap-4 rounded-lg border border-white/10 bg-ridge p-4"
          >
            <PillGroup
              label={t('gallery.view.mode')}
              options={[
                { value: 'grid', label: t('gallery.view.grid') },
                { value: 'table', label: t('gallery.view.table') },
                { value: 'slide', label: t('gallery.view.slide') },
              ]}
              value={view}
              onChange={(next: GalleryView) => setView(next)}
            />
            {/* Density only means something in grid view — a table row and a
                slide frame have no card size to change. Hiding it beats showing
                a control that silently does nothing. */}
            {view === 'grid' ? (
              <PillGroup
                label={t('gallery.view.size')}
                options={[
                  { value: 'sm', label: t('gallery.view.sizeSm') },
                  { value: 'md', label: t('gallery.view.sizeMd') },
                  { value: 'lg', label: t('gallery.view.sizeLg') },
                ]}
                value={gridSize}
                onChange={(next: GridSize) => setGridSize(next)}
              />
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  )
}
