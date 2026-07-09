// apps/web/src/modules/Cinema/components/icons.tsx
// Inline currentColor glyphs for the CinemaStudio surfaces (timeline controls,
// render/preview bars, audio rail). Never OS emoji — the design system keeps a
// closed icon language, and an emoji would paint its own palette and break the
// surface ladder. Drawn on one 24-unit grid with a 1.5 stroke so a row of them
// (the timeline's move/add/delete cluster) never looks ragged.

const STROKE = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

export function PlayIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

export function PauseIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  )
}

export function PlusIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg {...STROKE} className={className}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  )
}

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

// Move a shot earlier/later on the strip — chevrons, so they read as "shift"
export function ChevronLeftIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg {...STROKE} className={className}>
      <path d="M15 6l-6 6 6 6" />
    </svg>
  )
}

export function ChevronRightIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg {...STROKE} className={className}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}

// Generate = a spark/wand — the create action on a shot
export function SparkIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg {...STROKE} className={className}>
      <path d="M12 3v4" />
      <path d="M12 17v4" />
      <path d="M3 12h4" />
      <path d="M17 12h4" />
      <path d="M6 6l2.5 2.5" />
      <path d="M15.5 15.5L18 18" />
    </svg>
  )
}

// A title card — a text frame, no footage
export function TextCardIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg {...STROKE} className={className}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M8 10h8" />
      <path d="M8 14h5" />
    </svg>
  )
}

export function MusicIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg {...STROKE} className={className}>
      <path d="M9 18V6l10-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </svg>
  )
}

export function MicIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg {...STROKE} className={className}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0 0 12 0" />
      <path d="M12 17v4" />
    </svg>
  )
}

// Storyboard = a document with a spark, i.e. "script → shots"
export function StoryboardIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg {...STROKE} className={className}>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9" />
      <path d="M9 8h4" />
      <path d="M9 12h3" />
      <path d="M18 15l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" />
    </svg>
  )
}
