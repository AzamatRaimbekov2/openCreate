// Personal usage — "what did I spend it on" (ADR analytics §6).
//
// The same read model as the admin one, scoped by user_id, and CREDITS ONLY: no
// provider USD, no margin, no billed figure. A user has no business learning our
// cost basis, and this endpoint — the one they can actually call — is the natural
// place for it to leak. The MeUsage contract has nowhere to put it, so the
// guarantee is structural rather than a rule someone has to remember.
import { and, eq, gte, sql } from 'drizzle-orm'
import type { MeUsage, OutcomeCounts, UsageDay, UsageType } from '@opencreate/contracts'
import type { Db } from '../../db/client'
import { creditTransaction, generation, user } from '../../db/schema'

const GEN_DAY = sql<string>`strftime('%Y-%m-%d', ${generation.createdAt} / 1000, 'unixepoch')`

const countWhere = (column: unknown, value: string) =>
  sql<number>`sum(case when ${column} = ${value} then 1 else 0 end)`

function counts(succeeded: number, failed: number, processing: number): OutcomeCounts {
  const settledCount = succeeded + failed
  return {
    total: succeeded + failed + processing,
    succeeded,
    failed,
    processing,
    successRate: settledCount === 0 ? null : succeeded / settledCount,
  }
}

export function readMyUsage(db: Db, userId: string, windowDays: number, now: Date): MeUsage {
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000)
  const mine = and(eq(generation.userId, userId), gte(generation.createdAt, since))

  const ledger = db
    .select({
      spent: sql<number>`coalesce(-sum(case when ${creditTransaction.kind} = 'charge' then ${creditTransaction.amount} else 0 end), 0)`,
      refunded: sql<number>`coalesce(sum(case when ${creditTransaction.kind} = 'refund' then ${creditTransaction.amount} else 0 end), 0)`,
    })
    .from(creditTransaction)
    .where(and(eq(creditTransaction.userId, userId), gte(creditTransaction.createdAt, since)))
    .get()
  const creditsSpent = ledger?.spent ?? 0
  const creditsRefunded = ledger?.refunded ?? 0

  const totals = db
    .select({
      succeeded: countWhere(generation.status, 'succeeded'),
      failed: countWhere(generation.status, 'failed'),
      processing: countWhere(generation.status, 'processing'),
    })
    .from(generation)
    .where(mine)
    .get()

  const byType: UsageType[] = db
    .select({
      type: generation.type,
      creditsNet: sql<number>`coalesce(sum(${generation.costCredits}), 0)`,
      succeeded: countWhere(generation.status, 'succeeded'),
      failed: countWhere(generation.status, 'failed'),
      processing: countWhere(generation.status, 'processing'),
    })
    .from(generation)
    .where(mine)
    .groupBy(generation.type)
    .all()
    .map((r) => ({
      type: r.type,
      creditsNet: r.creditsNet,
      ...counts(r.succeeded, r.failed, r.processing),
    }))
    .sort((a, b) => b.creditsNet - a.creditsNet)

  const byDay: UsageDay[] = db
    .select({
      date: GEN_DAY,
      generations: sql<number>`count(*)`,
      creditsNet: sql<number>`coalesce(sum(${generation.costCredits}), 0)`,
    })
    .from(generation)
    .where(mine)
    .groupBy(GEN_DAY)
    .orderBy(GEN_DAY)
    .all()

  const balance = db.select({ b: user.creditsBalance }).from(user).where(eq(user.id, userId)).get()?.b ?? 0

  return {
    windowDays,
    creditsSpent,
    creditsRefunded,
    creditsNet: creditsSpent - creditsRefunded,
    balance,
    generations: counts(totals?.succeeded ?? 0, totals?.failed ?? 0, totals?.processing ?? 0),
    byType,
    byDay,
  }
}
