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

// Speaker = the shot's NATIVE generation audio toggle (the model's own
// soundtrack — a paid capability on some models, absent on others)
export function SpeakerIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg {...STROKE} className={className}>
      <path d="M11 5 6.5 9H3v6h3.5L11 19V5Z" />
      <path d="M15 9a4 4 0 0 1 0 6" />
      <path d="M17.5 6.5a7.5 7.5 0 0 1 0 11" />
    </svg>
  )
}

// Person = "make a character from this reference" — a head + shoulders bust, the
// same subject the cast tool tags. Sits on an attached reference thumbnail.
export function PersonIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg {...STROKE} className={className}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
    </svg>
  )
}

// Paperclip = attach a reference (the shot composer's cast tool)
export function PaperclipIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg {...STROKE} className={className}>
      <path d="M21 11.5l-8.5 8.5a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L10.2 17.7a1.7 1.7 0 0 1-2.4-2.4L15.5 7.5" />
    </svg>
  )
}

// Expand = open the composer's full-settings drawer
export function ExpandIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg {...STROKE} className={className}>
      <path d="M15 3h6v6" />
      <path d="M21 3l-7 7" />
      <path d="M9 21H3v-6" />
      <path d="M3 21l7-7" />
    </svg>
  )
}

// Scissors = split the shot at the playhead (timeline editing, Phase 4)
export function ScissorsIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg {...STROKE} className={className}>
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M20 4L8.12 15.88" />
      <path d="M14.47 14.48L20 20" />
      <path d="M8.12 8.12L12 12" />
    </svg>
  )
}

// Zoom in / out = a magnifier with a + / − (timeline scale controls, Phase 2)
export function ZoomInIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg {...STROKE} className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
      <path d="M11 8v6" />
      <path d="M8 11h6" />
    </svg>
  )
}

export function ZoomOutIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg {...STROKE} className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
      <path d="M8 11h6" />
    </svg>
  )
}

// Palette = the shot's STYLE (the visual preset the server blends into the
// prompt). A painter's palette, not a magic wand: a style says how the shot
// LOOKS, while the wand next to it (SparkIcon) already means "generate".
export function PaletteIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg {...STROKE} className={className}>
      <path d="M12 3a9 9 0 1 0 0 18c1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.1 0-1 .8-1.7 1.7-1.7H16a5 5 0 0 0 5-5c0-4-4-7.3-9-7.3Z" />
      <circle cx="8" cy="11.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="11.5" cy="7.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="10" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

// The shot's generation FRAME. The glyph is the value: it draws the actual
// rectangle the clip will be generated in, so the control shows its own setting
// without a text label (the trigger is icon-only — see PresetPickers). `null`
// (inherit the film canvas) draws a dashed frame: a shape that is not this
// shot's own decision.
export function FrameIcon({
  ratio,
  className = 'size-4',
}: {
  // The ratio to draw; null = "as in the film" (dashed, no opinion of its own)
  ratio: '16:9' | '1:1' | '9:16' | null
  className?: string
}) {
  // Rect geometry per ratio on the shared 24-unit grid, centred. Hand-tuned
  // rather than computed: at 16px a computed 9:16 box is a hairline sliver, so
  // each shape is drawn at the size that stays legible at icon scale.
  const box =
    ratio === '1:1'
      ? { x: 5.5, y: 5.5, width: 13, height: 13 }
      : ratio === '9:16'
        ? { x: 7.5, y: 3.5, width: 9, height: 17 }
        : { x: 2.5, y: 6.5, width: 19, height: 11 }

  return (
    <svg {...STROKE} className={className}>
      <rect {...box} rx="2" strokeDasharray={ratio === null ? '3 2.5' : undefined} />
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
