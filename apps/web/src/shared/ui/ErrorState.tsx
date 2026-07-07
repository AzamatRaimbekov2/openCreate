// apps/web/src/shared/ui/ErrorState.tsx
// Error state for failed data loads/actions (4-states rule). Deliberately calm:
// neutral card + ghost retry — no red-primary panic styling (frontend-error-ux).
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
    // Editorial voice: a hairline frame on the cream canvas (matches
    // EmptyState) — failure stays calm, typeset, and never red-primary.
    <div
      role="alert"
      className="flex flex-col items-center gap-4 border border-ink/15 px-6 py-10 text-center"
    >
      <p className="max-w-md text-ink">{message}</p>
      {onRetry ? (
        <Button variant="ghost" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      ) : null}
    </div>
  )
}
