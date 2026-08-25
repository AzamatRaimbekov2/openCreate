// Analytics routes (ADR: docs/wiki/decisions/analytics.md).
//
// Thin by design: every route is `guard → parse window → read → return`. All the
// judgement lives in the read model, and all the authorization lives in one
// decorator, so there is exactly one place to get either wrong.
import type { FastifyInstance, FastifyReply } from 'fastify'
import { analyticsWindowSchema } from '@opencreate/contracts'
import type { Db } from '../../db/client'
import { readHealth } from './health'
import { readMoney } from './money'
import { readMyUsage } from './usage'
import { readUsers } from './users'

export type AnalyticsDeps = {
  db: Db
  // The bridge between credits charged and USD billed. null ⇒ margin renders as
  // "not configured" rather than as zero (ADR §4).
  creditPriceUsd: number | null
  // Injected so tests can pin a window instead of racing the wall clock.
  now?: () => Date
}

export function registerAnalyticsRoutes(app: FastifyInstance, deps: AnalyticsDeps) {
  const now = deps.now ?? (() => new Date())

  // A bad window is a 400, not a 500. Unbounded `days` is the one input here that
  // can turn a dashboard panel into a full table scan, so it is validated at the
  // edge like every other body in the codebase rather than trusted.
  function windowOf(query: unknown, reply: FastifyReply): number | null {
    const parsed = analyticsWindowSchema.safeParse(query ?? {})
    if (parsed.success) return parsed.data.days
    reply.status(400).send({
      error: { code: 'validation_failed', message: parsed.error.issues[0]?.message ?? 'invalid window' },
    })
    return null
  }

  // These three aggregate across EVERY user, so each one is behind the DB-read
  // role check rather than a session claim.
  app.get('/api/admin/analytics/health', async (req, reply) => {
    await app.requireSuperAdmin(req)
    const days = windowOf(req.query, reply)
    if (days === null) return reply
    return readHealth(deps.db, days, now())
  })

  app.get('/api/admin/analytics/money', async (req, reply) => {
    await app.requireSuperAdmin(req)
    const days = windowOf(req.query, reply)
    if (days === null) return reply
    return readMoney(deps.db, days, now(), deps.creditPriceUsd)
  })

  app.get('/api/admin/analytics/users', async (req, reply) => {
    await app.requireSuperAdmin(req)
    const days = windowOf(req.query, reply)
    if (days === null) return reply
    return readUsers(deps.db, days, now())
  })

  // Every signed-in user, scoped to themselves. requireUser (not the admin
  // guard), and a contract that carries credits only.
  app.get('/api/me/usage', async (req, reply) => {
    const sessionUser = await app.requireUser(req)
    const days = windowOf(req.query, reply)
    if (days === null) return reply
    return readMyUsage(deps.db, sessionUser.id, days, now())
  })
}
