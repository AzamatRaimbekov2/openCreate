// "What is broken right now" (ADR analytics §1). Pure reads over the money
// path's own tables — this module writes nothing and owns no table.
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import type { AdminHealth, FailureSample, ModelHealth, OutcomeCounts, StuckJob } from '@opencreate/contracts'
import { STUCK_AFTER_MINUTES } from '@opencreate/contracts'
import type { Db } from '../../db/client'
import { filmRender, generation, modelRender } from '../../db/schema'

// A dashboard needs the SHAPE of the failure, not every instance: 40 rows is
// enough to see which model and which message dominate, and it bounds the
// response whatever happened overnight.
const FAILURE_SAMPLE_LIMIT = 40
// Stuck jobs lead the panel, so this cap is deliberately generous — if there are
// more than 100 stranded generations the count matters more than the list, and
// the totals above it already carry that.
const STUCK_LIMIT = 100

// SQLite has no boolean aggregate, so every "count where" is this shape.
const countWhere = (column: unknown, value: string) =>
  sql<number>`sum(case when ${column} = ${value} then 1 else 0 end)`

// null, not 0, when nothing settled: an idle day has an UNKNOWN success rate and
// rendering it as 0% paints a healthy system red (contracts analytics.ts).
function rate(succeeded: number, failed: number): number | null {
  const settled = succeeded + failed
  return settled === 0 ? null : succeeded / settled
}

function toCounts(row: { succeeded: number; failed: number; processing: number } | undefined): OutcomeCounts {
  const succeeded = row?.succeeded ?? 0
  const failed = row?.failed ?? 0
  const processing = row?.processing ?? 0
  return {
    total: succeeded + failed + processing,
    succeeded,
    failed,
    processing,
    successRate: rate(succeeded, failed),
  }
}

// One row per status bucket, for any of the three tables that share the status
// machine ('processing' → 'succeeded' | 'failed').
function outcomesFor(
  db: Db,
  table: typeof generation | typeof filmRender | typeof modelRender,
  since: Date,
): OutcomeCounts {
  const row = db
    .select({
      succeeded: countWhere(table.status, 'succeeded'),
      failed: countWhere(table.status, 'failed'),
      processing: countWhere(table.status, 'processing'),
    })
    .from(table)
    .where(gte(table.createdAt, since))
    .get()
  return toCounts(row)
}

// Exact medians, computed in SQLite rather than by pulling every duration into
// memory. The classic two-window trick: number the rows within each model by
// duration, count them, and average the middle one (odd) or two (even).
//
// MEDIAN and not mean, because one stranded 40-minute job drags a mean somewhere
// no user has ever waited, while the median still describes the typical wait.
function medianDurations(db: Db, since: Date): Map<string, number> {
  const rows = db.all<{ modelId: string; medianMs: number | null }>(sql`
    select model_id as modelId, avg(ms) as medianMs
    from (
      select
        model_id,
        completed_at - created_at as ms,
        row_number() over (partition by model_id order by completed_at - created_at) as rn,
        count(*) over (partition by model_id) as cnt
      from generation
      where completed_at is not null
        and created_at >= ${since.getTime()}
        and status in ('succeeded', 'failed')
    )
    where rn in ((cnt + 1) / 2, (cnt + 2) / 2)
    group by model_id
  `)
  return new Map(
    rows
      .filter((r): r is { modelId: string; medianMs: number } => r.medianMs !== null)
      .map((r) => [r.modelId, Math.round(r.medianMs)]),
  )
}

function modelBreakdown(db: Db, since: Date): ModelHealth[] {
  const rows = db
    .select({
      modelId: generation.modelId,
      provider: generation.provider,
      type: generation.type,
      succeeded: countWhere(generation.status, 'succeeded'),
      failed: countWhere(generation.status, 'failed'),
      processing: countWhere(generation.status, 'processing'),
    })
    .from(generation)
    .where(gte(generation.createdAt, since))
    .groupBy(generation.modelId, generation.provider, generation.type)
    .all()

  const medians = medianDurations(db, since)
  return rows
    .map((r) => ({
      modelId: r.modelId,
      provider: r.provider,
      type: r.type,
      ...toCounts(r),
      medianDurationMs: medians.get(r.modelId) ?? null,
    }))
    // Worst first. An operator opens this page because something is wrong, so the
    // thing that is wrong must not be below the fold. Models with nothing settled
    // (successRate null) sort last: they are not failing, they are just quiet.
    .sort((a, b) => (a.successRate ?? 2) - (b.successRate ?? 2) || b.total - a.total)
}

function recentFailures(db: Db, since: Date): FailureSample[] {
  return db
    .select({
      id: generation.id,
      modelId: generation.modelId,
      provider: generation.provider,
      type: generation.type,
      errorCode: generation.errorCode,
      errorMessage: generation.errorMessage,
      createdAt: generation.createdAt,
    })
    .from(generation)
    .where(and(gte(generation.createdAt, since), eq(generation.status, 'failed')))
    .orderBy(desc(generation.createdAt))
    .limit(FAILURE_SAMPLE_LIMIT)
    .all()
    .map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))
}

// Charged, never settled, and older than the reaper's own threshold. These are
// the rows where a refund may be owed, which is why they are their own panel and
// not folded into `processing` — a healthy in-flight job and an abandoned one
// look identical in a status count.
//
// Deliberately NOT windowed by `since`: a job stranded three weeks ago is still
// stranded, and hiding it behind a 7-day filter is how it stays that way.
function stuckJobs(db: Db, now: Date): StuckJob[] {
  const cutoff = new Date(now.getTime() - STUCK_AFTER_MINUTES * 60_000)
  return db
    .select({
      id: generation.id,
      modelId: generation.modelId,
      provider: generation.provider,
      createdAt: generation.createdAt,
    })
    .from(generation)
    .where(and(eq(generation.status, 'processing'), sql`${generation.createdAt} < ${cutoff.getTime()}`))
    .orderBy(desc(generation.createdAt))
    .limit(STUCK_LIMIT)
    .all()
    .map((r) => ({
      id: r.id,
      modelId: r.modelId,
      provider: r.provider,
      ageMinutes: Math.floor((now.getTime() - r.createdAt.getTime()) / 60_000),
    }))
}

export function readHealth(db: Db, windowDays: number, now: Date): AdminHealth {
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000)
  return {
    windowDays,
    generations: outcomesFor(db, generation, since),
    filmRenders: outcomesFor(db, filmRender, since),
    modelRenders: outcomesFor(db, modelRender, since),
    byModel: modelBreakdown(db, since),
    recentFailures: recentFailures(db, since),
    stuck: stuckJobs(db, now),
  }
}
