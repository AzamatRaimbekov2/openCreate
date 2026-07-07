// Credit ledger (plan Tasks 5–6). Every balance mutation happens INSIDE the same
// synchronous better-sqlite3 transaction as its credit_transaction ledger row, so
// user.creditsBalance (denormalized) can never drift from the ledger history.
// Kinds: signup_bonus (+), charge (−, at generation submit), refund (+, once per
// generation on failure) — the ADR's hold→settle collapsed into charge-at-submit.
// charge/refund also COMPOSE into a caller-owned transaction (optional trailing
// `tx` param): the generation service needs charge+insert and fail+refund to be
// single atomic units — money and the state it pays for must never part ways
// across a crash boundary.
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

// An open drizzle transaction handle (what db.transaction hands its callback).
// chargeCredits/refundCredits accept one so callers can make a balance
// mutation atomic with their OWN writes (e.g. charge + generation insert must
// commit or roll back together — a crash between them must not eat credits).
export type LedgerTx = Parameters<Parameters<Db['transaction']>[0]>[0]

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

// The charge mutation itself, always running on an OPEN transaction. The
// balance check happens inside it: throwing aborts the whole enclosing
// transaction (better-sqlite3 is synchronous), so a rejected charge leaves
// both balance and ledger untouched — the "never below zero" invariant lives
// here, not in callers.
function applyCharge(tx: LedgerTx, userId: string, amount: number, generationId: string) {
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
}

// Audit-line emitters are exported so a caller that ran the mutation inside
// ITS OWN transaction (tx variant below) can still produce the exact same
// structured event — but only after THAT transaction committed. One place owns
// the event shape; the after-commit discipline stays enforceable everywhere.
export function logCharge(
  log: MoneyLog | undefined,
  userId: string,
  generationId: string,
  amount: number,
) {
  log?.info({ event: 'credits.charge', userId, generationId, amount }, 'credits charged')
}

export function logRefund(
  log: MoneyLog | undefined,
  userId: string,
  generationId: string,
  amount: number,
) {
  log?.info({ event: 'credits.refund', userId, generationId, amount }, 'credits refunded')
}

// Charge at generation submit.
// With `tx`: the mutation JOINS the caller's open transaction (atomic with the
// caller's writes — e.g. the generation row insert) and NO log is emitted here,
// because the caller's transaction has not committed yet; the caller must call
// logCharge after its commit. A rolled-back outer transaction must never leave
// a phantom 'credits.charge' audit line.
// Without `tx`: owns its transaction and logs after commit (previous behavior).
export function chargeCredits(
  db: Db,
  userId: string,
  amount: number,
  generationId: string,
  log?: MoneyLog,
  tx?: LedgerTx,
) {
  if (tx) {
    applyCharge(tx, userId, amount, generationId)
    return
  }
  db.transaction((t) => applyCharge(t, userId, amount, generationId))
  // After-commit log: a thrown InsufficientCreditsError rolls back and skips
  // this line, so 'credits.charge' in the logs ⇔ a real ledger row exists.
  logCharge(log, userId, generationId, amount)
}

// The refund mutation on an OPEN transaction — idempotent by design: no charge
// row means nothing to refund (no-op), and an existing refund row for the
// generation means it already happened (no-op). Both guards run inside the
// same transaction as the mutation so concurrent refund attempts can't
// double-credit. Returns the refunded amount (0 = idempotent no-op).
function applyRefund(tx: LedgerTx, userId: string, generationId: string): number {
  const charge = tx
    .select()
    .from(creditTransaction)
    .where(
      and(eq(creditTransaction.generationId, generationId), eq(creditTransaction.kind, 'charge')),
    )
    .get()
  if (!charge) return 0
  const already = tx
    .select()
    .from(creditTransaction)
    .where(
      and(eq(creditTransaction.generationId, generationId), eq(creditTransaction.kind, 'refund')),
    )
    .get()
  if (already) return 0
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
  return -charge.amount
}

// Refund on generation failure.
// With `tx`: joins the caller's open transaction so the refund is atomic with
// the caller's writes (the failure settlement: mark-failed + refund must
// commit or roll back TOGETHER — flip-then-refund in two transactions left a
// failed row whose charge was kept forever if the process died in between).
// No log here (pre-commit); the caller logs via logRefund after ITS commit
// using the returned amount. Returns the refunded amount (0 = no-op) in both
// modes so callers can gate their audit line on a real mutation — concurrent
// pollers must not fill the logs with phantom refunds.
export function refundCredits(
  db: Db,
  userId: string,
  generationId: string,
  log?: MoneyLog,
  tx?: LedgerTx,
): number {
  if (tx) return applyRefund(tx, userId, generationId)
  const refunded = db.transaction((t) => applyRefund(t, userId, generationId))
  if (refunded > 0) logRefund(log, userId, generationId, refunded)
  return refunded
}
