// apps/web/src/modules/Cinema/model/shotGeneration.test.ts
// The SUBMIT (kick-off) mutation retries transient failures a bounded number of
// times, but never re-fires an ACTIONABLE/terminal one — retrying a
// content_blocked, a validation error, an insufficient-credits or a conflict
// either re-costs the user or is pointless. `shouldRetrySubmit` is the pure
// predicate TanStack Query's `retry` calls; testing it directly is far cheaper
// (and clearer) than driving a real mutation through fake timers.
import { ApiClientError } from 'shared/libs/apiClient'
import { shouldRetrySubmit } from './shotGeneration'

describe('shouldRetrySubmit', () => {
  it('retries transient provider/rate/internal failures', () => {
    expect(shouldRetrySubmit(0, new ApiClientError('rate_limited', 'x', 429))).toBe(true)
    expect(shouldRetrySubmit(0, new ApiClientError('provider_error', 'x', 502))).toBe(true)
    expect(shouldRetrySubmit(0, new ApiClientError('internal_error', 'x', 500))).toBe(true)
  })

  it('retries a raw network failure (no error envelope at all)', () => {
    expect(shouldRetrySubmit(0, new TypeError('Failed to fetch'))).toBe(true)
  })

  it('retries any 5xx even when the code is not in the transient set', () => {
    expect(shouldRetrySubmit(0, new ApiClientError('unauthorized', 'x', 503))).toBe(true)
  })

  it('never retries an actionable or terminal failure', () => {
    expect(shouldRetrySubmit(0, new ApiClientError('content_blocked', 'x', 422))).toBe(false)
    expect(shouldRetrySubmit(0, new ApiClientError('validation_failed', 'x', 400))).toBe(false)
    expect(shouldRetrySubmit(0, new ApiClientError('insufficient_credits', 'x', 402))).toBe(false)
    expect(shouldRetrySubmit(0, new ApiClientError('conflict', 'x', 409))).toBe(false)
  })

  it('stops after two retries even for a transient failure', () => {
    expect(shouldRetrySubmit(2, new ApiClientError('rate_limited', 'x', 429))).toBe(false)
  })
})
