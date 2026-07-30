// apps/api/src/modules/creator/routes.ts
// HTTP layer for openCreator — thin by design (the canvas/films precedent):
// require a session, parse with the SHARED contracts schema, delegate, done.
// There is no error mapping here because the service's errors already carry
// statusCode + apiCode, so app.ts's central handler emits the envelope
// (404 not_found for a foreign/missing session, 409 conflict for a turn that
// cannot start).
//
// Every POST answers 202, never 200/201: an agent turn is DETACHED (minutes of
// LLM + provider latency), so the response is the transcript SO FAR and the SPA
// polls GET until the status leaves `running`.
import type { FastifyInstance, FastifyReply } from 'fastify'
import { createCreatorSessionInputSchema } from '@opencreate/contracts'
import type { CreatorService } from './service'

// Strict rate bucket on the POSTs. Not the same reason as POST /api/generations
// (which caps provider money): a turn burns LLM TOKENS on every step, so a
// runaway client could spend real money without ever charging a credit. 10/min
// per IP is far above a human typing in a chat and a hard wall for a script.
const TURN_RATE_LIMIT = { max: 10, timeWindow: '1 minute' } as const

export function registerCreatorRoutes(app: FastifyInstance, service: CreatorService) {
  function badInput(reply: FastifyReply, message: string) {
    return reply.status(400).send({ error: { code: 'validation_failed', message } })
  }

  app.get('/api/creator/sessions', async (req) => {
    const user = await app.requireUser(req)
    return { items: service.listSessions(user.id) }
  })

  app.post(
    '/api/creator/sessions',
    { config: { rateLimit: TURN_RATE_LIMIT } },
    async (req, reply) => {
      const user = await app.requireUser(req)
      const parsed = createCreatorSessionInputSchema.safeParse(req.body)
      if (!parsed.success)
        return badInput(reply, parsed.error.issues[0]?.message ?? 'invalid input')
      // 202: the session and the user's message exist now; the agent's answer
      // does not yet.
      return reply.status(202).send(service.createSession(user.id, parsed.data.message))
    },
  )

  // The SPA's 2s poll while the session is running/awaiting_confirm.
  app.get<{ Params: { id: string } }>('/api/creator/sessions/:id', async (req) => {
    const user = await app.requireUser(req)
    return service.getSession(user.id, req.params.id)
  })

  app.post<{ Params: { id: string } }>(
    '/api/creator/sessions/:id/messages',
    { config: { rateLimit: TURN_RATE_LIMIT } },
    async (req, reply) => {
      const user = await app.requireUser(req)
      const parsed = createCreatorSessionInputSchema.safeParse(req.body)
      if (!parsed.success)
        return badInput(reply, parsed.error.issues[0]?.message ?? 'invalid input')
      // 409 (from the service) when a turn is already running or a plan is
      // awaiting confirmation — two agent loops on one conversation would
      // interleave their messages and both spend.
      return reply
        .status(202)
        .send(service.postMessage(user.id, req.params.id, parsed.data.message))
    },
  )

  // THE BUDGET GATE's user-facing half: one deliberate click flips the session's
  // `confirmed` flag and starts the executing turn. No body — the plan being
  // confirmed is the one in the transcript, so there is nothing for a client to
  // choose (and nothing for it to tamper with).
  app.post<{ Params: { id: string } }>(
    '/api/creator/sessions/:id/confirm',
    { config: { rateLimit: TURN_RATE_LIMIT } },
    async (req, reply) => {
      const user = await app.requireUser(req)
      return reply.status(202).send(service.confirm(user.id, req.params.id))
    },
  )
}
