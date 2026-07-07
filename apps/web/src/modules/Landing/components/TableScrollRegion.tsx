// apps/web/src/modules/Landing/components/TableScrollRegion.tsx
// The no-gradient scroll affordance for the index tables (QA round 2): wraps
// a wide table in a keyboard-focusable overflow region and shows a quiet mono
// "scroll →" hint while the content is actually wider than the column. The
// usual edge FADE would need a CSS gradient — banned by the owner rule — so
// the terminal answer is a caption-voice chevron hint that appears only when
// there is really something to scroll (dynamic, not breakpoint-guessed).
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

  useEffect(() => {
    const region = regionRef.current
    if (!region) return
    const measure = () => setHasOverflow(region.scrollWidth > region.clientWidth)
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
      {/* Scrollable regions must be reachable by keyboard: tabIndex + a real
          accessible name make arrow-key scrolling possible without a mouse */}
      <div
        ref={regionRef}
        role="region"
        aria-label={label}
        tabIndex={0}
        className="overflow-x-auto rounded-lg focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
      >
        {children}
      </div>
    </div>
  )
}
