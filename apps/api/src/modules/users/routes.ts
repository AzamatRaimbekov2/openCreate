// GET /api/me (plan Task 5). Reads the balance fresh from the user table (not
// from the session payload) so the number is always ledger-accurate, matching
// the contracts meSchema shape: { id, email, name, creditsBalance }.
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { Db } from '../../db/client'
import { user } from '../../db/schema'

export function registerUserRoutes(app: FastifyInstance, db: Db) {
  app.get('/api/me', async (req) => {
    const sessionUser = await app.requireUser(req)
    const row = db
      .select({
        id: user.id,
        email: user.email,
        name: user.name,
        creditsBalance: user.creditsBalance,
      })
      .from(user)
      .where(eq(user.id, sessionUser.id))
      .get()
    if (!row) {
      // Session exists but the user row is gone (deleted account with a live
      // cookie) — surface as not_found rather than a misleading 500.
      const err = new Error('User not found') as Error & { statusCode: number; apiCode: string }
      err.statusCode = 404
      err.apiCode = 'not_found'
      throw err
    }
    return row
  })
}
