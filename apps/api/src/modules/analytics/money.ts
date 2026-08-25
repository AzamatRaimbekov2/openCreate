// "What did it cost and what did we earn" (ADR analytics §3–§5).
//
// Two money systems meet here and they are NOT the same currency:
//
//   credits — what we charged the user. Authoritative, from the ledger.
//   USD     — what the provider charged us. Reported by kie/Runware/DeepInfra/
//             ByteDance, and NOT reported by Segmind, whose adapter refuses to
//             invent a figure.
//
// Everything in this file exists to keep them apart until an operator supplies
// the one number that bridges them (CREDIT_PRICE_USD), and to keep the Segmind
// gap VISIBLE rather than summed away.
import { and, gte, sql } from 'drizzle-orm'
import type { AdminMoney, CostBreakdown, DaySpend, Margin, ModelSpend } from '@opencreate/contracts'
import type { Db } from '../../db/client'
import { creditTransaction, generation } from '../../db/schema'

// The column is named `runware_cost_usd` for history only — it holds the neutral
// per-provider figure for whichever backend ran the job (see schema.ts). It is
// TEXT, so every read casts; a row that never got a figure is NULL and must stay
// distinguishable from a row that genuinely cost zero.
const COST_USD = sql<number>`coalesce(sum(cast(${generation.runwareCostUsd} as real)), 0)`
const PRICED = sql<number>`sum(case when ${generation.runwareCostUsd} is null then 0 else 1 end)`
const UNPRICED = sql<number>`sum(case when ${generation.runwareCostUsd} is null then 1 else 0 end)`

// Only SETTLED rows carry a cost. A still-processing generation has been charged
// but not yet billed, and counting it as unpriced would report a permanent gap
// that closes by itself in ninety seconds.
const settled = sql`${generation.status} in ('succeeded', 'failed')`

// UTC. The API never guesses the operator's timezone — a dashboard that silently
// re-buckets by browser locale makes two people reading the same day disagree.
const DAY = sql<string>`strftime('%Y-%m-%d', ${generation.createdAt} / 1000, 'unixepoch')`

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// `creditsNet` is charges MINUS refunds. The ledger stores charges negative and
// refunds positive, so a plain sum of `amount` for those two kinds is already the
// net, sign-flipped. A model that fails half its jobs and refunds them must not
// read as revenue (ADR §5).
function creditTotals(db: Db, since: Date): { charged: number; refunded: number } {
  const row = db
    .select({
      charged: sql<number>`coalesce(-sum(case when ${creditTransaction.kind} = 'charge' then ${creditTransaction.amount} else 0 end), 0)`,
      refunded: sql<number>`coalesce(sum(case when ${creditTransaction.kind} = 'refund' then ${creditTransaction.amount} else 0 end), 0)`,
    })
    .from(creditTransaction)
    .where(gte(creditTransaction.createdAt, since))
    .get()
  return { charged: row?.charged ?? 0, refunded: row?.refunded ?? 0 }
}

function costTotals(db: Db, since: Date): CostBreakdown {
  const row = db
    .select({ billedUsd: COST_USD, pricedCount: PRICED, unpricedCount: UNPRICED })
    .from(generation)
    .where(and(gte(generation.createdAt, since), settled))
    .get()
  return {
    billedUsd: round2(row?.billedUsd ?? 0),
    pricedCount: row?.pricedCount ?? 0,
    unpricedCount: row?.unpricedCount ?? 0,
  }
}

function byModel(db: Db, since: Date): ModelSpend[] {
  return db
    .select({
      modelId: generation.modelId,
      provider: generation.provider,
      count: sql<number>`count(*)`,
      creditsNet: sql<number>`coalesce(sum(${generation.costCredits}), 0)`,
      billedUsd: COST_USD,
      pricedCount: PRICED,
      unpricedCount: UNPRICED,
    })
    .from(generation)
    .where(and(gte(generation.createdAt, since), settled))
    .groupBy(generation.modelId, generation.provider)
    .all()
    .map((r) => ({ ...r, billedUsd: round2(r.billedUsd) }))
    // Most expensive first: this table is read to find where the money goes.
    .sort((a, b) => b.billedUsd - a.billedUsd || b.creditsNet - a.creditsNet)
}

function byDay(db: Db, since: Date): DaySpend[] {
  return db
    .select({
      date: DAY,
      generations: sql<number>`count(*)`,
      creditsNet: sql<number>`coalesce(sum(${generation.costCredits}), 0)`,
      billedUsd: COST_USD,
      pricedCount: PRICED,
      unpricedCount: UNPRICED,
    })
    .from(generation)
    .where(and(gte(generation.createdAt, since), settled))
    .groupBy(DAY)
    .orderBy(DAY)
    .all()
    .map((r) => ({ ...r, billedUsd: round2(r.billedUsd) }))
}

// The bridge between the two currencies, and the only place a business fact
// enters this module. With no rate configured EVERY derived figure is null —
// deliberately, so the UI cannot render "$0 margin" for "we don't know" (ADR §4).
export function computeMargin(
  creditPriceUsd: number | null,
  creditsNet: number,
  billedUsd: number,
): Margin {
  if (creditPriceUsd === null) {
    return { creditPriceUsd: null, revenueUsd: null, marginUsd: null, marginPercent: null }
  }
  const revenueUsd = round2(creditsNet * creditPriceUsd)
  const marginUsd = round2(revenueUsd - billedUsd)
  return {
    creditPriceUsd,
    revenueUsd,
    marginUsd,
    // Zero revenue is an idle window, not a 0% margin — and dividing by it yields
    // Infinity, which JSON cannot carry at all.
    marginPercent: revenueUsd === 0 ? null : Math.round((marginUsd / revenueUsd) * 1000) / 10,
  }
}

export function readMoney(
  db: Db,
  windowDays: number,
  now: Date,
  creditPriceUsd: number | null,
): AdminMoney {
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000)
  const credits = creditTotals(db, since)
  const cost = costTotals(db, since)
  const creditsNet = credits.charged - credits.refunded
  return {
    windowDays,
    creditsCharged: credits.charged,
    creditsRefunded: credits.refunded,
    creditsNet,
    cost,
    margin: computeMargin(creditPriceUsd, creditsNet, cost.billedUsd),
    byModel: byModel(db, since),
    byDay: byDay(db, since),
  }
}
