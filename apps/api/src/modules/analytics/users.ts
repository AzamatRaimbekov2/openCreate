// "Who uses it and how much" (ADR analytics §1).
import { gte, sql } from 'drizzle-orm'
import type { AdminUsers, DayVolume, SurfaceVolume, TopUser } from '@opencreate/contracts'
import type { Db } from '../../db/client'
import { filmRender, generation, modelRender, user } from '../../db/schema'

const TOP_USER_LIMIT = 20

const GEN_DAY = sql<string>`strftime('%Y-%m-%d', ${generation.createdAt} / 1000, 'unixepoch')`
const USER_DAY = sql<string>`strftime('%Y-%m-%d', ${user.createdAt} / 1000, 'unixepoch')`

// Per-day rows arrive from three independent GROUP BYs (signups, activity,
// volume) that each only emit days they have data for. Merging them on the date
// key keeps a day with signups but no generations from vanishing from the chart.
function mergeDays(
  signups: { date: string; signups: number }[],
  activity: { date: string; activeUsers: number; generations: number }[],
): DayVolume[] {
  const byDate = new Map<string, DayVolume>()
  const at = (date: string): DayVolume => {
    const existing = byDate.get(date)
    if (existing) return existing
    const fresh = { date, signups: 0, activeUsers: 0, generations: 0 }
    byDate.set(date, fresh)
    return fresh
  }
  for (const r of signups) at(r.date).signups = r.signups
  for (const r of activity) {
    const day = at(r.date)
    day.activeUsers = r.activeUsers
    day.generations = r.generations
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

// Every surface in one list. The two render tables are folded in as their own
// pseudo-types rather than left out: a film render is real work the system did,
// and a volume chart that silently omits it under-reports the busiest days.
function bySurface(db: Db, since: Date): SurfaceVolume[] {
  const gens = db
    .select({ surface: generation.type, count: sql<number>`count(*)` })
    .from(generation)
    .where(gte(generation.createdAt, since))
    .groupBy(generation.type)
    .all()
  const films = db
    .select({ count: sql<number>`count(*)` })
    .from(filmRender)
    .where(gte(filmRender.createdAt, since))
    .get()
  const models = db
    .select({ count: sql<number>`count(*)` })
    .from(modelRender)
    .where(gte(modelRender.createdAt, since))
    .get()

  return [
    ...gens,
    { surface: 'film_render', count: films?.count ?? 0 },
    { surface: 'model_render', count: models?.count ?? 0 },
  ]
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count)
}

// Net credits, so a user whose generations all failed and refunded does not top
// the spend table.
function topUsers(db: Db, since: Date): TopUser[] {
  return db
    .select({
      id: user.id,
      email: user.email,
      generations: sql<number>`count(${generation.id})`,
      creditsNet: sql<number>`coalesce(sum(${generation.costCredits}), 0)`,
    })
    .from(generation)
    .innerJoin(user, sql`${user.id} = ${generation.userId}`)
    .where(gte(generation.createdAt, since))
    .groupBy(user.id, user.email)
    .orderBy(sql`count(${generation.id}) desc`)
    .limit(TOP_USER_LIMIT)
    .all()
}

export function readUsers(db: Db, windowDays: number, now: Date): AdminUsers {
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000)

  const totalUsers = db.select({ n: sql<number>`count(*)` }).from(user).get()?.n ?? 0
  const newUsers =
    db.select({ n: sql<number>`count(*)` }).from(user).where(gte(user.createdAt, since)).get()?.n ?? 0
  // Sign-ins are not recorded anywhere, so "active" means GENERATED SOMETHING.
  // That is the more honest number for this product regardless: a session that
  // opened the gallery and left is not a user of the thing that costs money.
  const activeUsers =
    db
      .select({ n: sql<number>`count(distinct ${generation.userId})` })
      .from(generation)
      .where(gte(generation.createdAt, since))
      .get()?.n ?? 0

  const signups = db
    .select({ date: USER_DAY, signups: sql<number>`count(*)` })
    .from(user)
    .where(gte(user.createdAt, since))
    .groupBy(USER_DAY)
    .all()

  const activity = db
    .select({
      date: GEN_DAY,
      activeUsers: sql<number>`count(distinct ${generation.userId})`,
      generations: sql<number>`count(*)`,
    })
    .from(generation)
    .where(gte(generation.createdAt, since))
    .groupBy(GEN_DAY)
    .all()

  return {
    windowDays,
    totalUsers,
    newUsers,
    activeUsers,
    byDay: mergeDays(signups, activity),
    bySurface: bySurface(db, since),
    topUsers: topUsers(db, since),
  }
}
