// Shared API error envelope. Every non-2xx response from apps/api is
// `{ error: { code, message } }` so the web client can switch on a closed
// set of codes (e.g. insufficient_credits -> pricing banner) instead of
// string-matching messages. Codes mirror the spec's error taxonomy.
import { z } from 'zod'

export const apiErrorCodeSchema = z.enum([
  'unauthorized',
  'not_found',
  'validation_failed',
  'insufficient_credits',
  'content_blocked',
  'provider_error',
  'internal_error',
])
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>

export const apiErrorSchema = z.object({
  error: z.object({ code: apiErrorCodeSchema, message: z.string() }),
})
export type ApiError = z.infer<typeof apiErrorSchema>
