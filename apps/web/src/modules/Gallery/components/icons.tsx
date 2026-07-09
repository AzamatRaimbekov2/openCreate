// apps/web/src/modules/Gallery/components/icons.tsx
// Inline currentColor glyphs for the generation action set. Never OS emoji —
// the design system keeps a closed icon triad, and an emoji would render in the
// platform's own palette, breaking the surface ladder wherever it lands.
//
// One file because these five are one family: they appear together in the card's
// overflow menu and again as the detail view's icon rail, and they must be drawn
// on the same 24-unit grid with the same 1.5 stroke or the rail looks ragged.

const STROKE = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

export function TrashIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg {...STROKE} className={className}>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  )
}

export function DownloadIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg {...STROKE} className={className}>
      <path d="M12 3v12" />
      <path d="M7 11l5 5 5-5" />
      <path d="M4 20h16" />
    </svg>
  )
}

// Prompt = a document with text lines (copy-to-clipboard action)
export function PromptIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg {...STROKE} className={className}>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h6" />
      <path d="M9 12h6" />
      <path d="M9 16h3" />
    </svg>
  )
}

// Regenerate = a closed refresh loop
export function RegenerateIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg {...STROKE} className={className}>
      <path d="M20 12a8 8 0 1 1-2.3-5.6" />
      <path d="M20 4v5h-5" />
    </svg>
  )
}

// The overflow affordance — vertical, so it reads as "more" and not "drag"
export function DotsIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <circle cx="12" cy="5" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="12" cy="19" r="1.75" />
    </svg>
  )
}

// Confirmation feedback for the copy action (swaps in for PromptIcon briefly)
export function CheckIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg {...STROKE} strokeWidth={2} className={className}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}
