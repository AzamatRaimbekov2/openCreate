// apps/web/src/shared/ui/Modal.tsx
// Accessible modal dialog: portal render, Escape + overlay close, body scroll
// lock, focus restore. With role="alertdialog" it is the project's blocking
// error-modal pattern (frontend-error-ux) — compose with ErrorState inside.
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

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
}

export function Modal({ isOpen, onClose, title, children, role = 'dialog' }: ModalProps) {
  const { t } = useTranslation()
  // Where focus returns when the dialog closes
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    previousFocusRef.current = document.activeElement as HTMLElement | null
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    // Lock the page behind the dialog
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
      previousFocusRef.current?.focus()
    }
  }, [isOpen, onClose])

  // Move focus into the dialog when it opens
  useEffect(() => {
    if (isOpen) dialogRef.current?.focus()
  }, [isOpen])

  if (!isOpen) return null

  return createPortal(
    // The overlay is presentational (click target only) — it must NOT be
    // aria-hidden: that would hide the dialog inside it from the a11y tree
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 px-4"
      onClick={onClose}
      role="presentation"
    >
      {/* Editorial dialog: a cream sheet with a hairline border and near-flat
          corners — reads as a card of the same paper, not a floating glass
          panel. Depth comes from the dimmed page + hairline, not heavy blur. */}
      <div
        ref={dialogRef}
        role={role}
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        // Clicks inside must not bubble to the overlay's close handler
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-lg rounded-sm border border-ink/15 bg-cream p-8 shadow-lg"
      >
        <div className="mb-5 flex items-start justify-between gap-4 border-b border-ink/15 pb-4">
          {/* Serif display title — dialogs carry the same headline voice as pages */}
          <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="flex size-10 shrink-0 items-center justify-center rounded-full border border-ink/20 text-ink-soft transition-colors duration-200 hover:border-ink hover:text-ink focus-visible:ring-2 focus-visible:ring-vermillion focus-visible:outline-none"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}
