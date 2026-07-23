// Public auth configuration the SPA reads at runtime to decide which optional
// sign-in providers to render. It is the SINGLE source of truth for provider
// enablement — derived server-side from the real config — so the client can
// never drift from what the server actually has wired (ADR google-oauth).
import { z } from 'zod'

export const authConfigSchema = z.object({
  // True iff the server has BOTH Google OAuth creds set (the same pair the
  // better-auth Google provider gates on). Drives the Google button's visibility.
  googleEnabled: z.boolean(),
})

export type AuthConfig = z.infer<typeof authConfigSchema>
