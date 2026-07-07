// apps/web/src/modules/Generator/components/SubmitErrorBanner.tsx
// Inline, non-blocking submit-failure banner for the commission sheet
// (frontend-error-ux: modals only for failures that need a decision — these
// have inline next steps). Maps the two special API failures to their own
// localized copy: insufficient credits (+ pricing link) and safety blocks
// (the refund promise). v3 terminal: steel surface block + glow-red left rule
// (red = the triad's failure color; the surface itself stays calm).
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ApiClientError } from 'shared/libs/apiClient'

export type SubmitErrorBannerProps = {
  // The create-generation mutation's error (rendered only when it exists)
  error: Error
}

export function SubmitErrorBanner({ error }: SubmitErrorBannerProps) {
  const { t } = useTranslation()
  const isInsufficient = error instanceof ApiClientError && error.code === 'insufficient_credits'
  // Safety-filter block (API 'content_blocked'): the failure is about the
  // CONTENT, the fix is a different prompt, and the user must hear the charge
  // came back (spec: clear message + refund on NSFW block)
  const isBlocked = error instanceof ApiClientError && error.code === 'content_blocked'

  return (
    <div
      role="alert"
      className="mt-6 flex flex-col gap-1 rounded-lg border-l-2 border-glow-red bg-steel px-4 py-3 text-sm"
    >
      <span className="text-mist">
        {isInsufficient
          ? t('generator.errors.insufficientCredits')
          : isBlocked
            ? t('generator.errors.contentBlocked')
            : t('errors.actionFailed')}
      </span>
      {isInsufficient ? (
        // Typed Link since Task 20 shipped /pricing — SPA navigation keeps the
        // drafted prompt alive in the store if the user comes back. Portal
        // blue = the sanctioned prose-link color (v3 §2); the failure red
        // stays on the rule, never on the recovery link.
        <Link
          to="/pricing"
          className="self-start font-medium text-portal underline decoration-portal/40 underline-offset-4 transition-colors duration-200 hover:decoration-portal focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
        >
          {t('generator.errors.seePricing')}
        </Link>
      ) : null}
    </div>
  )
}
