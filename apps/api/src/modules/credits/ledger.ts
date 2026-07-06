// Credit ledger (plan Tasks 5–6). Every balance mutation happens INSIDE the same
// synchronous better-sqlite3 transaction as its credit_transaction ledger row, so
// user.creditsBalance (denormalized) can never drift from the ledger history.
// Kinds: signup_bonus (+), charge (−, at generation submit), refund (+, once per
// generation on failure) — the ADR's hold→settle collapsed into charge-at-submit.
import { randomUUID } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import type { Db } from '../../db/client'
import { creditTransaction, user } from '../../db/schema'

export function grantSignupBonus(db: Db, userId: string, amount: number) {
  db.transaction((tx) => {
    tx.update(user)
      .set({ creditsBalance: sql`${user.creditsBalance} + ${amount}` })
      .where(eq(user.id, userId))
      .run()
    tx.insert(creditTransaction)
      .values({ id: randomUUID(), userId, amount, kind: 'signup_bonus', createdAt: new Date() })
      .run()
  })
}
