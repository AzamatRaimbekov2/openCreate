// apps/web/src/shared/ui/toast.ts
// The imperative toast API — how NON-React code raises a notification. Event
// handlers, mutation callbacks and effect bodies call `toast.error({...})`
// without a hook, because it reads the store through `getState()` rather than
// subscribing. The <Toaster> (mounted once in the shell) renders whatever lands
// in the store. Rendering + lifecycle live there; this file is just the pen.
import { useToastStore } from './toastStore'
import type { ToastInput } from './toastStore'

// A caller names the intent (error/info/success) by choosing the method, so the
// variant is supplied here rather than in the options object.
type ToastOptions = Omit<ToastInput, 'variant'>

// Bind a variant into a one-arg raiser. Returns the toast id so a caller can
// dismiss it programmatically (e.g. an action that resolves elsewhere).
function raise(variant: ToastInput['variant']) {
  return (options: ToastOptions): string => useToastStore.getState().push({ ...options, variant })
}

export const toast = {
  error: raise('error'),
  info: raise('info'),
  success: raise('success'),
  // Manual dismissal by id — the counterpart to the id `raise` returns
  dismiss: (id: string): void => useToastStore.getState().dismiss(id),
}
