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
  // 429 from @fastify/rate-limit (ops hardening): a stable code so the SPA
  // can show a dedicated "slow down" message instead of a generic error.
  'rate_limited',
  // 409: the request is valid but the resource's CURRENT STATE forbids it —
  // e.g. DELETE of a still-processing generation (deleting mid-flight would
  // forfeit the refund and orphan the provider task). Distinct from
  // validation_failed so the SPA can say "wait for it to finish" specifically.
  'conflict',
  // 403: authenticated, but not entitled — today only the super_admin analytics
  // routes. Distinct from 'unauthorized' because the fixes differ: unauthorized
  // means sign in, forbidden means this account will never be enough, and an SPA
  // that conflates them bounces an admin to the login screen in a loop.
  'forbidden',
  'internal_error',
])
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>

export const apiErrorSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
    // ── Optional domain detail (added 2026-07-21) ──────────────────────────
    // A transport code answers "what kind of failure"; these answer "about
    // WHAT". They exist because one `validation_failed` covered ten different
    // render refusals, and the single sentence it produced could not tell a user
    // whether to wait, regenerate, or remove.
    //
    // ALL THREE ARE OPTIONAL, and that is the compatibility guarantee: every
    // existing producer (app.ts's central handler, each module's own envelope)
    // keeps emitting `{code, message}` and keeps parsing. Zod objects strip
    // unknown keys rather than rejecting them, so a server that starts sending
    // these BEFORE a client updates is also safe — the fields are simply dropped
    // until this schema knows about them. Server-first rollout is therefore free.
    //
    // `reason` is deliberately a plain string here, not a domain enum: errors.ts
    // is the transport layer and must not import Cinema (or any module's) types.
    // The consumer narrows it — e.g. `renderBlockReasonSchema.safeParse` — so an
    // unrecognized future reason degrades to generic copy instead of throwing.
    reason: z.string().optional(),
    // What the reason is about, so the client can name and locate it.
    subjectKind: z.enum(['shot', 'audio', 'film']).optional(),
    subjectId: z.string().optional(),
  }),
})
export type ApiError = z.infer<typeof apiErrorSchema>
