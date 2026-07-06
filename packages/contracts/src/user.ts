// GET /api/me contract. `creditsBalance` is the denormalized balance kept on
// the user row (updated transactionally with each ledger write) so the web
// header chip needs one cheap query, not a ledger aggregation.
import { z } from 'zod'

export const meSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  creditsBalance: z.number().int(),
})
export type Me = z.infer<typeof meSchema>
