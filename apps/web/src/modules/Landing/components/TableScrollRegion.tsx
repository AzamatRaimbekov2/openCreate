// apps/web/src/modules/Landing/components/TableScrollRegion.tsx
// The no-gradient scroll affordances for the index tables (QA round 2 + the
// 390px affordance finding): wraps a wide table in a keyboard-focusable
// overflow region and, while the content is actually wider than the column,
// shows a quiet mono "scroll →" hint PLUS a solid right-edge overlay strip
// that marks the cut-off column edge. The usual edge FADE would need a CSS
// gradient — banned by the owner rule — so the strip is one translucent SOLID
// color (bg-void/60) and the hint is the caption-voice chevron; both are
// dynamic (measured, not breakpoint-guessed), and the strip retires once the
// user has scrolled to the far right (nothing left to point at).
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

export type TableScrollRegionProps = {
  // Accessible name for the scrollable region (usually the table's title)
  label: string
  // The wide table itself
  children: ReactNode
}

export function TableScrollRegion({ label, children }: TableScrollRegionProps) {
  const { t } = useTranslation()
  const regionRef = useRef<HTMLDivElement>(null)
  // Whether the content is currently wider than the region — drives the hint
  const [hasOverflow, setHasOverflow] = useState(false)
  // Whether the region is scrolled to its far right — retires the edge strip
  // (an affordance pointing at nothing would misreport "more columns")
  const [isAtEnd, setIsAtEnd] = useState(false)

  // Shared by the resize observer and the scroll handler: -1 tolerates the
  // sub-pixel scroll positions browsers report on fractional zoom levels
  const measureScrollEnd = () => {
    const region = regionRef.current
    if (!region) return
    setIsAtEnd(region.scrollLeft + region.clientWidth >= region.scrollWidth - 1)
  }

  useEffect(() => {
    const region = regionRef.current
    if (!region) return
    const measure = () => {
      setHasOverflow(region.scrollWidth > region.clientWidth)
      measureScrollEnd()
    }
    measure()
    // jsdom (tests) has no ResizeObserver — a window resize listener is the
    // functional fallback there and in any engine missing the API
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(region)
    // The table child drives scrollWidth; observing it re-measures when the
    // content (fonts, locale strings, data rows) changes width
    if (region.firstElementChild) observer.observe(region.firstElementChild)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="flex flex-col gap-2">
      {/* Sighted-only hint in the caption voice — AT users get the labelled,
          focusable region below instead of a decorative arrow announcement */}
      {hasOverflow ? (
        <p
          aria-hidden="true"
          className="self-end text-xs text-mist-dim"
        >
          {t('common.scrollHint')}
        </p>
      ) : null}
      {/* relative wrapper so the edge strip can overlay the region without
          joining the scrollable content (it must stay pinned to the frame) */}
      <div className="relative">
        {/* Scrollable regions must be reachable by keyboard: tabIndex + a real
            accessible name make arrow-key scrolling possible without a mouse */}
        <div
          ref={regionRef}
          role="region"
          aria-label={label}
          tabIndex={0}
          onScroll={measureScrollEnd}
          className="overflow-x-auto rounded-lg focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
        >
          {children}
        </div>
        {hasOverflow && !isAtEnd ? (
          // The 390px scrollability affordance: one translucent SOLID void
          // strip (no gradient — owner rule) dims the cut-off column edge so
          // the truncation reads as "continues", not "ends". Decorative only
          // (aria-hidden + pointer-events-none): AT and keyboard users get the
          // labelled focusable region + the mono hint instead.
          <div
            aria-hidden="true"
            data-testid="table-scroll-edge"
            className="pointer-events-none absolute inset-y-0 right-0 w-6 rounded-r-lg bg-void/60"
          />
        ) : null}
      </div>
    </div>
  )
}
