// Credit ledger (plan Tasks 5–6). Every balance mutation happens INSIDE the same
// synchronous better-sqlite3 transaction as its credit_transaction ledger row, so
// user.creditsBalance (denormalized) can never drift from the ledger history.
// Kinds: signup_bonus (+), charge (−, at generation submit), refund (+, once per
// generation on failure) — the ADR's hold→settle collapsed into charge-at-submit.
import { randomUUID } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import type { FastifyBaseLogger } from 'fastify'
import type { Db } from '../../db/client'
import { creditTransaction, user } from '../../db/schema'

// Money-path observability: every balance mutation can emit ONE structured
// log entry (event + userId + generationId + amount) AFTER its transaction
// committed — a support question ("where did my credits go?") must be
// answerable from logs alone. The logger is an optional trailing param so
// request handlers pass req.log (reqId correlation) while non-request callers
// (signup hook, boot sweep) pass the base app logger.
export type MoneyLog = Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>

// Thrown when a charge would take the balance below zero. Carries statusCode +
// apiCode so the central error handler (app.ts) maps it straight to the
// 402 { error: { code: 'insufficient_credits' } } envelope.
export class InsufficientCreditsError extends Error {
  statusCode = 402
  apiCode = 'insufficient_credits'
  constructor() {
    super('Not enough credits')
  }
}

export function grantSignupBonus(db: Db, userId: string, amount: number, log?: MoneyLog) {
  db.transaction((tx) => {
    tx.update(user)
      .set({ creditsBalance: sql`${user.creditsBalance} + ${amount}` })
      .where(eq(user.id, userId))
      .run()
    tx.insert(creditTransaction)
      .values({ id: randomUUID(), userId, amount, kind: 'signup_bonus', createdAt: new Date() })
      .run()
  })
  // Logged only after the transaction committed — a rolled-back grant must
  // never appear in the audit trail.
  log?.info({ event: 'credits.signup_bonus', userId, amount }, 'signup bonus granted')
}

// Charge at generation submit. The balance check happens INSIDE the transaction:
// throwing rolls the whole transaction back (better-sqlite3 is synchronous), so
// a rejected charge leaves both balance and ledger untouched — the "never below
// zero" invariant lives here, not in callers.
export function chargeCredits(
  db: Db,
  userId: string,
  amount: number,
  generationId: string,
  log?: MoneyLog,
) {
  db.transaction((tx) => {
    const row = tx.select({ b: user.creditsBalance }).from(user).where(eq(user.id, userId)).get()
    if (!row || row.b < amount) throw new InsufficientCreditsError()
    tx.update(user)
      .set({ creditsBalance: sql`${user.creditsBalance} - ${amount}` })
      .where(eq(user.id, userId))
      .run()
    tx.insert(creditTransaction)
      .values({
        id: randomUUID(),
        userId,
        amount: -amount, // ledger stores charges as negative (signed amounts)
        kind: 'charge',
        generationId,
        createdAt: new Date(),
      })
      .run()
  })
  // After-commit log: a thrown InsufficientCreditsError rolls back and skips
  // this line, so 'credits.charge' in the logs ⇔ a real ledger row exists.
  log?.info({ event: 'credits.charge', userId, generationId, amount }, 'credits charged')
}

// Refund on generation failure — idempotent by design: no charge row means
// nothing to refund (no-op), and an existing refund row for the generation
// means it already happened (no-op). Both guards run inside the transaction so
// concurrent refund attempts can't double-credit.
export function refundCredits(db: Db, userId: string, generationId: string, log?: MoneyLog) {
  // Whether THIS call actually applied the refund (vs the idempotent no-op
  // paths) — only a real balance mutation may produce a log entry, otherwise
  // concurrent pollers would fill the logs with phantom refunds.
  let refunded = 0
  db.transaction((tx) => {
    const charge = tx
      .select()
      .from(creditTransaction)
      .where(
        and(eq(creditTransaction.generationId, generationId), eq(creditTransaction.kind, 'charge')),
      )
      .get()
    if (!charge) return
    const already = tx
      .select()
      .from(creditTransaction)
      .where(
        and(eq(creditTransaction.generationId, generationId), eq(creditTransaction.kind, 'refund')),
      )
      .get()
    if (already) return
    tx.update(user)
      .set({ creditsBalance: sql`${user.creditsBalance} + ${-charge.amount}` })
      .where(eq(user.id, userId))
      .run()
    tx.insert(creditTransaction)
      .values({
        id: randomUUID(),
        userId,
        amount: -charge.amount, // charge was negative → refund is its positive mirror
        kind: 'refund',
        generationId,
        createdAt: new Date(),
      })
      .run()
    refunded = -charge.amount
  })
  if (refunded > 0)
    log?.info(
      { event: 'credits.refund', userId, generationId, amount: refunded },
      'credits refunded',
    )
}
