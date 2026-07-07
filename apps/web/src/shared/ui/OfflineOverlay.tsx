// apps/web/src/shared/ui/OfflineOverlay.tsx
// Screen-blocking no-internet overlay (frontend-error-ux contract): subscribes
// to the browser's online/offline events via useSyncExternalStore, covers the
// whole app while navigator.onLine is false, and clears itself on reconnect.
import { useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'

// Notify React whenever connectivity flips either way
function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener('online', onStoreChange)
  window.addEventListener('offline', onStoreChange)
  return () => {
    window.removeEventListener('online', onStoreChange)
    window.removeEventListener('offline', onStoreChange)
  }
}

const getSnapshot = () => navigator.onLine

// Server snapshot (unused in the SPA, required by the hook's contract): assume online
const getServerSnapshot = () => true

export function OfflineOverlay() {
  const { t } = useTranslation()
  const isOnline = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  if (isOnline) return null

  return (
    // z-[60] sits above the Modal layer (z-50) — connectivity outranks any
    // dialog. Terminal voice (v3): mono weight-400 30px headline + one line on
    // the flat void; no action button because the overlay clears itself on
    // reconnect (the browser is the retry mechanism here).
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={t('errors.offline.title')}
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-void px-6 text-center"
    >
      <h1 className="max-w-xl text-3xl font-normal text-white">{t('errors.offline.title')}</h1>
      <p className="max-w-md text-mist-dim">{t('errors.offline.description')}</p>
    </div>
  )
}
