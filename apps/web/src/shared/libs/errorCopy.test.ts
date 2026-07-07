// apps/web/src/shared/libs/errorCopy.test.ts
// Behavior (QA finding 3): every machine-readable API error code — the
// contracts apiErrorCodeSchema values, also carried by Generation.errorCode —
// maps to a stable i18n key, and anything unknown (a future code shipped
// server-side first, a missing code) degrades to the generic key. Raw server
// text is never the primary message anywhere.
import { errorCodeMessageKey } from './errorCopy'

describe('errorCodeMessageKey', () => {
  it.each([
    ['unauthorized', 'errors.codes.unauthorized'],
    ['not_found', 'errors.codes.notFound'],
    ['validation_failed', 'errors.codes.validationFailed'],
    ['insufficient_credits', 'errors.codes.insufficientCredits'],
    ['content_blocked', 'errors.codes.contentBlocked'],
    ['provider_error', 'errors.codes.providerError'],
    ['rate_limited', 'errors.codes.rateLimited'],
    ['conflict', 'errors.codes.conflict'],
    ['internal_error', 'errors.codes.internalError'],
  ])('maps %s to %s', (code, key) => {
    expect(errorCodeMessageKey(code)).toBe(key)
  })

  it('falls back to the generic key for unknown or future codes', () => {
    // The web client never zod-validates GET bodies — a code added to the API
    // before the SPA redeploys must degrade gracefully, not crash or leak
    expect(errorCodeMessageKey('totally_new_code')).toBe('errors.codes.unknown')
  })

  it('falls back to the generic key when the code is missing', () => {
    expect(errorCodeMessageKey(null)).toBe('errors.codes.unknown')
    expect(errorCodeMessageKey(undefined)).toBe('errors.codes.unknown')
    expect(errorCodeMessageKey('')).toBe('errors.codes.unknown')
  })
})
