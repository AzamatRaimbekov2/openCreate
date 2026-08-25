// GET /api/me contract. `creditsBalance` is the denormalized balance kept on
// the user row (updated transactionally with each ledger write) so the web
// header chip needs one cheap query, not a ledger aggregation.
import { z } from 'zod'

export const meSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  creditsBalance: z.number().int(),
  // 'user' | 'super_admin'. A plain string, not an enum: the SPA only ever asks
  // "is this super_admin", and an unrecognized future role must degrade to "not
  // an admin" rather than fail the whole profile parse and log the user out.
  //
  // This drives NAV VISIBILITY only. The wall is server-side (requireSuperAdmin,
  // which re-reads the row on every request) — hiding a link has never stopped
  // anyone from typing the URL.
  role: z.string(),
})
export type Me = z.infer<typeof meSchema>
