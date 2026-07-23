// apps/web/src/shared/ui/toastStore.ts
// The toast system's state core — a tiny Zustand store holding the LIVE stack.
// It is deliberately pure: no timers, no DOM, no i18n. The <Toaster> owns the
// lifecycle (auto-dismiss, pause-on-hover, rendering); non-React code raises
// toasts through the imperative `toast` API in ./toast, which calls push here.
// Kept in shared/ui so any module (Cinema surfaces generation failures, the
// Generator, …) can notify without a cross-module import.
import { create } from 'zustand'

// info/success are announced politely (role="status"); error assertively
// (role="alert") — the <Toaster> maps the variant to the live-region role.
export type ToastVariant = 'error' | 'info' | 'success'

// An optional action button. onClick MAY be async — the <Toaster> shows a
// pending state while it runs and dismisses the toast once it settles, so the
// button can never be double-fired.
export type ToastAction = {
  label: string
  onClick: () => void | Promise<void>
}

export type ToastInput = {
  variant: ToastVariant
  // The one-line headline — carries the meaning (status is never color-only)
  title: string
  // Optional second line: the "what to do next" detail
  description?: string
  action?: ToastAction
  // Auto-dismiss delay in ms. Omitted → the <Toaster> picks a per-variant
  // default; 0 → sticky (dismiss only manually or via an action).
  durationMs?: number
  // Collapses a repeat push to ONE live toast: a re-poll that re-detects the
  // same failure must not stack a second copy. Freed when the toast dismisses.
  dedupeKey?: string
}

export type Toast = ToastInput & { id: string }

// Max concurrent toasts — a burst never buries the screen; the OLDEST drops so
// the newest (most relevant) always survives.
const STACK_CAP = 3

type ToastStore = {
  toasts: Toast[]
  // Returns the toast's id (or, when deduped, the id of the live toast it
  // collapsed into) so a caller can dismiss it programmatically.
  push: (input: ToastInput) => string
  dismiss: (id: string) => void
  clear: () => void
}

// Monotonic id source — unique within a session, no crypto dependency needed
let counter = 0
const nextId = () => `toast-${(counter += 1)}`

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  push: (input) => {
    // Dedupe against the LIVE stack — the first push wins (its content stays)
    // and its id is returned, so a re-poll neither stacks nor overwrites.
    if (input.dedupeKey !== undefined) {
      const live = get().toasts.find((toast) => toast.dedupeKey === input.dedupeKey)
      if (live) return live.id
    }
    const id = nextId()
    set((state) => {
      const next = [...state.toasts, { ...input, id }]
      // Trim from the FRONT so the cap drops the oldest, keeps the newest three
      return { toasts: next.length > STACK_CAP ? next.slice(next.length - STACK_CAP) : next }
    })
    return id
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
  clear: () => set({ toasts: [] }),
}))
