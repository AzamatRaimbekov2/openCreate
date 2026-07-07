// apps/web/src/shared/libs/errorCopy.ts
// Single mapping from machine-readable API error codes (contracts
// apiErrorCodeSchema — also the Generation.errorCode field) to i18n message
// keys under errors.codes.*. Components render t(errorCodeMessageKey(code)) as
// the PRIMARY failure message; raw server/provider text may only ever appear
// as a secondary small diagnostic line (design.md §9 copy rules).
import type { ApiErrorCode } from '@opencreate/contracts'

// Explicit Record over the closed enum keeps the copy honest: adding a code to
// contracts without a message here becomes a typecheck error in this app.
const ERROR_CODE_KEYS: Record<ApiErrorCode, string> = {
  unauthorized: 'errors.codes.unauthorized',
  not_found: 'errors.codes.notFound',
  validation_failed: 'errors.codes.validationFailed',
  insufficient_credits: 'errors.codes.insufficientCredits',
  content_blocked: 'errors.codes.contentBlocked',
  provider_error: 'errors.codes.providerError',
  rate_limited: 'errors.codes.rateLimited',
  conflict: 'errors.codes.conflict',
  internal_error: 'errors.codes.internalError',
}

// Type predicate instead of a cast: the runtime `in` check IS the type proof
function isKnownCode(code: string): code is ApiErrorCode {
  return code in ERROR_CODE_KEYS
}

// Accepts any string (or nothing): codes arrive from network payloads the SPA
// does not re-validate, so a future/unknown code must degrade to the generic
// message — never a raw string, never a crash.
export function errorCodeMessageKey(code: string | null | undefined): string {
  if (code && isKnownCode(code)) return ERROR_CODE_KEYS[code]
  return 'errors.codes.unknown'
}
