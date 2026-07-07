// apps/web/src/shared/ui/ErrorState.tsx
// Error state for failed data loads/actions (4-states rule). Deliberately calm:
// a quiet hairline frame + amber ghost retry — no red-primary panic styling
// (frontend-error-ux). The red triad is reserved for the failure STATUS itself
// (failed cards, destructive actions), not for the recovery surface.
import { useTranslation } from 'react-i18next'
import { Button } from './Button'

export type ErrorStateProps = {
  // User-safe, already-localized message — NEVER raw backend/exception text
  message: string
  // When provided, renders the localized "Try again" button
  onRetry?: (() => void) | undefined
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  const { t } = useTranslation()
  return (
    // role=alert: the failure replaced expected content, announce it.
    // Terminal voice: a white/10 hairline frame on the void (matches
    // EmptyState) — failure stays calm, typeset, and never red-primary.
    <div
      role="alert"
      className="flex flex-col items-center gap-4 rounded-lg border border-white/10 px-6 py-10 text-center"
    >
      <p className="max-w-md text-mist">{message}</p>
      {onRetry ? (
        <Button variant="ghost" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      ) : null}
    </div>
  )
}
