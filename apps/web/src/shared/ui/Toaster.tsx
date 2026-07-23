// apps/web/src/shared/ui/Toaster.tsx
// The toast portal — mounted ONCE in the shell root (routes/__root.tsx). It
// subscribes to `toastStore` and renders the live stack in a corner, owning the
// whole lifecycle the store deliberately does not: auto-dismiss, pause on
// hover/focus, the async-action pending state, and manual/keyboard dismissal.
//
// Surface (design.md §12): a toast is a floating TEXT/STATUS surface, so it is
// OPAQUE STEEL, never frosted glass — a translucent panel over the editor's
// moving media is unreadable (the same asymmetry Select's popup and
// ViewSettingsMenu document). Depth comes from the existing `shadow-glass-lg`
// float token, not a bespoke shadow. The triad status color rides a LEFT RULE
// (the proven `border-l-2 border-<glow>` idiom, SubmitErrorBanner/RenderBar),
// never a fill and never a gradient (hard owner rule). Status is not
// color-only: the title text carries the meaning, the rule reinforces it.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Button } from './Button'
import { useToastStore } from './toastStore'
import type { Toast, ToastVariant } from './toastStore'

// Per-variant auto-dismiss defaults (ms). Errors linger longest — they usually
// carry an action the user needs a beat to read and reach; success is quickest.
const DEFAULT_DURATION: Record<ToastVariant, number> = {
  error: 10_000,
  info: 6_000,
  success: 5_000,
}

// The triad status accent, as a border COLOR on a 2px left rule: red = failure,
// portal = neutral/informational (the only sanctioned prose accent), green =
// positive. `border-<color>` colors every side, but only the left has width, so
// this paints exactly the left rule with no per-side color conflict.
const ACCENT: Record<ToastVariant, string> = {
  error: 'border-glow-red',
  info: 'border-portal',
  success: 'border-glow-green',
}

type ToastItemProps = {
  toast: Toast
  onDismiss: () => void
  t: TFunction
}

function ToastItem({ toast, onDismiss, t }: ToastItemProps) {
  const duration = toast.durationMs ?? DEFAULT_DURATION[toast.variant]
  // Paused while the pointer is over the toast or a child holds focus — a user
  // reading it (or tabbing to its action) never loses it mid-sentence.
  const [isPaused, setIsPaused] = useState(false)
  // The async action is in flight: the button shows busy, and the countdown is
  // held so the toast cannot vanish out from under a running "soften & retry".
  const [isActing, setIsActing] = useState(false)

  useEffect(() => {
    if (duration <= 0 || isPaused || isActing) return
    const timer = window.setTimeout(onDismiss, duration)
    return () => window.clearTimeout(timer)
  }, [duration, isPaused, isActing, onDismiss])

  const handleAction = async () => {
    if (!toast.action) return
    setIsActing(true)
    try {
      await toast.action.onClick()
      // Action taken → the toast's job is done. A degrading handler (e.g. the
      // enhance endpoint is absent) raises its OWN fallback toast and resolves,
      // so this dismisses the original while the fallback stays — never a dead
      // click, never a raw error left on screen.
      onDismiss()
    } catch {
      // Defensive: handlers are expected to swallow their own errors and
      // degrade. If one throws anyway, KEEP the toast (do not dismiss) and drop
      // the pending state so the user can retry rather than face a spent action.
      setIsActing(false)
    }
  }

  return (
    <div
      // Per-item live-region role: assertive for errors, polite for the rest.
      role={toast.variant === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      // onFocus/onBlur are the bubbling focusin/focusout in React, so focus
      // landing on the action or close button pauses the countdown too.
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
      className={`pointer-events-auto flex w-full items-start gap-3 rounded-2xl border-l-2 ${ACCENT[toast.variant]} bg-steel px-4 py-3 shadow-glass-lg ring-1 ring-white/10`}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-sm text-white">{toast.title}</p>
        {toast.description ? (
          <p className="text-xs leading-relaxed text-mist-dim">{toast.description}</p>
        ) : null}
        {toast.action ? (
          <div className="mt-1">
            <Button variant="ghost" size="sm" onClick={handleAction} isLoading={isActing}>
              {toast.action.label}
            </Button>
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t('common.close')}
        className="grid size-6 shrink-0 place-items-center rounded-full border border-white/10 text-mist-dim transition-colors duration-200 hover:bg-ridge hover:text-white focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
      >
        ✕
      </button>
    </div>
  )
}

export function Toaster() {
  const { t } = useTranslation()
  const toasts = useToastStore((state) => state.toasts)
  const dismiss = useToastStore((state) => state.dismiss)

  // Nothing live → render nothing. Each item is its own live region (role
  // alert/status), so a persistent empty container buys no extra announcement.
  if (toasts.length === 0) return null

  return createPortal(
    // z-[55] rides ABOVE the Modal layer (z-50) so a toast can appear over a
    // dialog, but BELOW the OfflineOverlay (z-[60]) — losing connectivity still
    // outranks everything. Full-width strip on 390px, bottom-right on ≥sm. The
    // container passes clicks through (pointer-events-none); each toast re-enables
    // them, so the empty gutter never eats a click aimed at the canvas.
    <div
      role="region"
      aria-label={t('toasts.region')}
      className="pointer-events-none fixed inset-x-4 bottom-4 z-[55] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-4 sm:items-end"
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto w-full max-w-sm">
          <ToastItem toast={toast} onDismiss={() => dismiss(toast.id)} t={t} />
        </div>
      ))}
    </div>,
    document.body,
  )
}
