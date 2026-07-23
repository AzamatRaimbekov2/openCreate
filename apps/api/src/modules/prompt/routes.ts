// apps/api/src/modules/prompt/routes.ts
// HTTP layer for the prompt enhancer — thin, mirroring the other module routes:
// require a session, parse with the SHARED contracts schema at the boundary,
// delegate to the service. The service's PromptEnhanceUnavailableError carries
// its own statusCode + apiCode (502 provider_error), so it falls straight through
// to app.ts's central error handler — no local mapDomainError needed.
import type { FastifyInstance, FastifyReply } from 'fastify'
import { promptEnhanceInputSchema } from '@opencreate/contracts'
import type { PromptEnhanceService } from './enhance'

// An enhance call spends real LLM tokens on a FREE endpoint, so it gets its own
// strict bucket rather than riding the generous 300/min global. 20/min lets a
// user iterate on a prompt (and hammer "soften & retry" a few times) while capping
// scripted abuse of an unauthenticated-cost surface. Same shape as the film
// clip/render buckets.
const ENHANCE_RATE_LIMIT = { max: 20, timeWindow: '1 minute' }

export function registerPromptRoutes(app: FastifyInstance, service: PromptEnhanceService) {
  function badInput(reply: FastifyReply, message: string) {
    return reply.status(400).send({ error: { code: 'validation_failed', message } })
  }

  // POST /api/prompt/enhance — rough idea → one cinematic Wan prompt. Session-
  // guarded (requireUser) but NOT film-scoped: it is a pure text transform with no
  // ownership to check. Charges nothing. The service returns { prompt }; a missing
  // DEEPINFRA_TOKEN or a malformed model answer surfaces as 502 provider_error.
  app.post(
    '/api/prompt/enhance',
    { config: { rateLimit: ENHANCE_RATE_LIMIT } },
    async (req, reply) => {
      await app.requireUser(req)
      const parsed = promptEnhanceInputSchema.safeParse(req.body)
      if (!parsed.success) return badInput(reply, parsed.error.issues[0]?.message ?? 'invalid input')
      // No guard() wrapper: PromptEnhanceUnavailableError already carries its HTTP
      // status + apiCode, so the central handler maps it to the standard envelope.
      return service.enhance(parsed.data)
    },
  )
}
