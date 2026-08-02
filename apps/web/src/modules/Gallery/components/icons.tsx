// apps/web/src/modules/Gallery/components/icons.tsx
// Inline currentColor glyphs for the generation action set. Never OS emoji —
// the design system keeps a closed icon triad, and an emoji would render in the
// platform's own palette, breaking the surface ladder wherever it lands.
//
// One file because they are one family: they appear together in the card's
// overflow menu and again in the detail viewer's menu, and they must be drawn
// on the same 24-unit grid with the same 1.5 stroke or the menu looks ragged.
// PlayIcon is the odd one out — it is not an ACTION but the affordance painted
// over a video poster, so it is the only FILLED glyph here (a hollow triangle
// disappears against moving footage).

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

// Edit = a pencil. The action it leads used to be called "Regenerate" and wore
// a refresh loop (deleted with this change — nothing referenced it afterwards),
// which promised something it never did: the action re-fills the composer and
// waits for the user; nothing is regenerated until they submit.
export function PencilIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg {...STROKE} className={className}>
      <path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16v4Z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  )
}

// The play affordance over a video poster — FILLED, not stroked: it sits on top
// of a frame of real footage, where a 1.5px outline reads as noise
export function PlayIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M8 5.5v13l11-6.5-11-6.5Z" />
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
