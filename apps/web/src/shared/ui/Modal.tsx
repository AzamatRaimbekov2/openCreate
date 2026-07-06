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
      <div
        ref={dialogRef}
        role={role}
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        // Clicks inside must not bubble to the overlay's close handler
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="flex size-10 items-center justify-center rounded-xl text-ink-soft transition-opacity duration-150 hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
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
