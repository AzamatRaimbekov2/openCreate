// GET /api/credits/transactions (plan Task 6). Last 100 ledger rows for the
// signed-in user, newest first, mapped to the contracts
// creditTransactionListSchema shape ({ items: [...] }) — dates go out as ISO
// strings because the wire contract is JSON, not Date objects.
import { desc, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { Db } from '../../db/client'
import { creditTransaction } from '../../db/schema'

export function registerCreditRoutes(app: FastifyInstance, db: Db) {
  app.get('/api/credits/transactions', async (req) => {
    const sessionUser = await app.requireUser(req)
    const rows = db
      .select({
        id: creditTransaction.id,
        amount: creditTransaction.amount,
        kind: creditTransaction.kind,
        generationId: creditTransaction.generationId,
        createdAt: creditTransaction.createdAt,
      })
      .from(creditTransaction)
      .where(eq(creditTransaction.userId, sessionUser.id))
      // Matches idx_credit_tx_user(user_id, created_at DESC) — index-backed scan.
      .orderBy(desc(creditTransaction.createdAt))
      .limit(100)
      .all()
    return {
      items: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    }
  })
}
