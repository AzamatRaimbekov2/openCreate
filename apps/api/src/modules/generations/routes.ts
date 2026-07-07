// HTTP layer for generations (plan Task 10) — deliberately thin: parse/clamp
// inputs, delegate to the service, map `created` to 201/202. All domain rules
// (validation, charging, refunds) live in service.ts; all error → envelope
// mapping lives in the app.ts central handler. Every route requires a session.
import type { FastifyInstance } from 'fastify'
import { createGenerationInputSchema } from '@opencreate/contracts'
import type { GenerationService } from './service'

// list defaults/caps: 24 fills the gallery grid nicely; 50 caps a hostile
// ?limit= so one request can't dump an unbounded result set.
const DEFAULT_LIMIT = 24
const MAX_LIMIT = 50

export function registerGenerationRoutes(app: FastifyInstance, service: GenerationService) {
  // Strict rate bucket (ops hardening): every submit spends provider money —
  // 20/min per IP caps a runaway client/script while a human clicking the
  // generator stays far below it. Reads (list/get) keep the global limit only:
  // the SPA polls processing videos every 4s.
  app.post('/api/generations', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const sessionUser = await app.requireUser(req)
    // Body is validated with the SHARED contracts schema — the SPA validates
    // with the same zod object, so client and server can never disagree.
    const parsed = createGenerationInputSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'validation_failed',
          message: parsed.error.issues[0]?.message ?? 'invalid input',
        },
      })
    }
    // req.log is the per-request child logger — passing it down stamps every
    // money-path log line (charge/refund/settle/provider error) with reqId.
    const { dto, created } = await service.create(sessionUser.id, parsed.data, req.log)
    // 201 = image finished synchronously; 202 = video accepted, still processing.
    return reply.status(created ? 201 : 202).send(dto)
  })

  app.get<{ Querystring: { limit?: string; cursor?: string } }>('/api/generations', async (req) => {
    const sessionUser = await app.requireUser(req)
    const raw = Number(req.query.limit ?? DEFAULT_LIMIT)
    // NaN/0/negative fall back to the default; big values clamp to MAX.
    const limit = Number.isFinite(raw) && raw > 0 ? Math.min(raw, MAX_LIMIT) : DEFAULT_LIMIT
    return service.list(sessionUser.id, limit, req.query.cursor)
  })

  app.get<{ Params: { id: string } }>('/api/generations/:id', async (req) => {
    const sessionUser = await app.requireUser(req)
    // While processing this doubles as the Runware poll (see service.get) —
    // polls can settle money (refund/settle), so they get req.log too.
    return service.get(sessionUser.id, req.params.id, req.log)
  })

  app.delete<{ Params: { id: string } }>('/api/generations/:id', async (req, reply) => {
    const sessionUser = await app.requireUser(req)
    await service.remove(sessionUser.id, req.params.id)
    return reply.status(204).send()
  })
}
