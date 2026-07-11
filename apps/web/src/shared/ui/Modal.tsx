// apps/web/src/shared/ui/Modal.tsx
// Accessible modal dialog: portal render, dependency-free focus TRAP
// (Tab/Shift+Tab cycle inside the dialog), Escape + overlay close, body
// scroll lock, focus restore to the trigger. With role="alertdialog" it is
// the project's blocking error-modal pattern (frontend-error-ux) — compose
// with ErrorState inside.
// v3 terminal: the sheet is a STEEL surface step (#1d293d, 8px radius) over a
// dimmed void — elevation comes from the surface color, not blur or shadows.
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { GLASS_SURFACE, STEEL_SURFACE } from './surfaces'

// Everything keyboard-reachable inside the dialog. Enumerated at KEYDOWN time
// (not once on open) so content that swaps while open — skeleton → data rows,
// error → retry — never leaves the trap holding stale elements.
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'video[controls]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

// Keep Tab/Shift+Tab cycling inside the dialog: wrap last→first (Tab) and
// first→last (Shift+Tab); if focus somehow sits outside (or on the dialog
// shell itself), pull it back to the boundary element for that direction.
function trapTabKey(event: KeyboardEvent, dialog: HTMLDivElement) {
  const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
  const first = focusable.at(0)
  const last = focusable.at(-1)
  // Nothing focusable inside: park focus on the dialog so Tab cannot escape
  if (!first || !last) {
    event.preventDefault()
    dialog.focus()
    return
  }
  const active = document.activeElement
  // "At the boundary" = outside the dialog, or on the dialog shell (tabindex
  // -1 initial focus) — the browser default from there would leave the trap
  const isInside = active instanceof HTMLElement && dialog.contains(active)
  if (event.shiftKey) {
    if (!isInside || active === dialog || active === first) {
      event.preventDefault()
      last.focus()
    }
  } else if (!isInside || active === dialog || active === last) {
    event.preventDefault()
    first.focus()
  }
}

export type ModalProps = {
  // Controlled visibility — the modal renders nothing when closed
  isOpen: boolean
  // Called on Escape, overlay click, and the close button
  onClose: () => void
  // Dialog heading (also the accessible name)
  title: string
  // Dialog body
  children: ReactNode
  // 'alertdialog' for blocking failures that need acknowledgement; 'dialog' otherwise
  role?: 'dialog' | 'alertdialog'
  // Sheet width. 'lg' is for media: a portrait image in a max-w-lg sheet is a
  // stamp, and the user opened the detail view precisely to stop squinting.
  size?: 'md' | 'lg'
  // Frosted-glass sheet instead of the opaque steel one. Only for surfaces whose
  // CONTENT is the hero (the media detail view) — never for text dialogs, where
  // a busy backdrop bleeding through the copy is just harder to read.
  surface?: 'steel' | 'glass'
  // Hide the heading row (the media detail draws its own chrome over the image)
  hideHeader?: boolean
}

const SIZE_CLASS = {
  md: 'max-w-lg',
  lg: 'max-w-5xl',
} as const

// The frosted recipe and its opaque baseline now live in ONE place (surfaces.ts)
// so a sheet, a card and the composer capsule cannot drift apart.
const SURFACE_CLASS = {
  steel: STEEL_SURFACE,
  glass: GLASS_SURFACE,
} as const

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  role = 'dialog',
  size = 'md',
  surface = 'steel',
  hideHeader = false,
}: ModalProps) {
  const { t } = useTranslation()
  // Where focus returns when the dialog closes
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  // Latest onClose behind a stable ref: consumers pass fresh inline arrows on
  // every render, and with onClose in the effect deps each parent re-render
  // re-ran the cleanup — restoring focus to the TRIGGER while the dialog was
  // still open. The lifecycle below now keys on isOpen alone.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  // One open/close lifecycle: capture the trigger, move focus in, trap Tab,
  // close on Escape, lock scroll; cleanup unwinds everything and restores
  // focus — so unmount-while-open behaves exactly like a normal close.
  useEffect(() => {
    if (!isOpen) return
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    // Capture BEFORE focusing the dialog, or the restore target is the dialog
    dialogRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current()
        return
      }
      const dialog = dialogRef.current
      if (event.key === 'Tab' && dialog) trapTabKey(event, dialog)
    }
    document.addEventListener('keydown', handleKeyDown)
    // Lock the page behind the dialog
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
      previousFocusRef.current?.focus()
    }
  }, [isOpen])

  if (!isOpen) return null

  return createPortal(
    // The overlay is presentational (click target only) — it must NOT be
    // aria-hidden: that would hide the dialog inside it from the a11y tree.
    // bg-void/70 dims the page in the void's own hue instead of flat black.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-void/70 px-4"
      onClick={onClose}
      role="presentation"
    >
      {/* Terminal dialog sheet: one surface step above the void (steel), 8px
          radius, white/10 hairline — depth is the color step, never a shadow */}
      <div
        ref={dialogRef}
        role={role}
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        // Clicks inside must not bubble to the overlay's close handler
        onClick={(event) => event.stopPropagation()}
        // max-h + flex lets a tall child (a portrait image) scroll or shrink
        // INSIDE the sheet instead of running off the bottom of the viewport
        // `relative` anchors the floating close button of the headerless variant
        className={`relative flex max-h-[92dvh] w-full flex-col rounded-2xl border ${SIZE_CLASS[size]} ${SURFACE_CLASS[surface]} ${hideHeader ? 'p-3' : 'p-8'}`}
      >
        {hideHeader ? (
          // No heading row, but the dialog still needs a close control and an
          // accessible name (aria-label on the shell carries the latter)
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="absolute top-6 right-6 z-10 flex size-10 items-center justify-center rounded-full border border-white/10 bg-void/60 text-mist-dim backdrop-blur transition-colors duration-200 hover:bg-ridge hover:text-white focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
          >
            ✕
          </button>
        ) : (
          <div className="mb-5 flex items-start justify-between gap-4 border-b border-white/10 pb-4">
            {/* Mono weight-400 title — headings are never bold in v3 */}
            <h2 className="text-2xl font-normal text-white">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              className="flex size-10 shrink-0 items-center justify-center rounded-full border border-white/10 text-mist-dim transition-colors duration-200 hover:bg-ridge hover:text-white focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
            >
              ✕
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  )
}
