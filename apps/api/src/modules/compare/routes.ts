// HTTP layer for the /compare utility — thin, mirroring the other module
// routes: require a session, parse with the SHARED contracts schema at the
// boundary, delegate to the integration. DeepinfraImageError carries its own
// statusCode + apiCode (502 provider_error), so it falls straight through to
// app.ts's central error handler — no local mapping needed.
//
// WHY THIS ROUTE EXISTS AT ALL (instead of the SPA calling DeepInfra): the
// DEEPINFRA_TOKEN is a server secret — shipping it to the browser would hand
// every visitor the operator's balance. The SPA compares THROUGH us.
//
// WHY IT BLOCKS for the whole render (~10-40s) instead of the submit/poll seam
// every paid generation uses: there is no charge to protect with settlement,
// no gallery row to reconcile, and exactly one caller (the hidden /compare
// page) that WANTS the wall time as its measurement. A synchronous call IS the
// benchmark.
import type { FastifyInstance } from 'fastify'
import { compareGenerateInputSchema } from '@opencreate/contracts'
import {
  DeepinfraImageError,
  generateQwenImage,
} from '../../integrations/deepinfra/deepinfra-image'

// Every call spends real provider money (7.5¢/image) on an endpoint that
// bypasses the credit ledger, so it gets a strict bucket: 10/min lets an
// operator iterate while capping a scripted drain of the DeepInfra balance.
const COMPARE_RATE_LIMIT = { max: 10, timeWindow: '1 minute' }

export type CompareRouteOptions = {
  // config.deepinfraToken. null = provider not configured: the route answers a
  // clean 502 provider_error instead of crashing boot — same optional-secret
  // discipline as the prompt enhancer and the Seedance channel.
  deepinfraToken: string | null
}

export function registerCompareRoutes(app: FastifyInstance, opts: CompareRouteOptions) {
  app.post(
    '/api/compare/generate',
    { config: { rateLimit: COMPARE_RATE_LIMIT } },
    async (req, reply) => {
      await app.requireUser(req)
      const parsed = compareGenerateInputSchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.status(400).send({
          error: {
            code: 'validation_failed',
            message: parsed.error.issues[0]?.message ?? 'invalid input',
          },
        })
      }
      if (!opts.deepinfraToken) {
        // Thrown (not replied) so the central handler shapes the envelope and
        // logs it as a provider_error like every other unconfigured backend.
        throw new DeepinfraImageError('qwen image is not configured (DEEPINFRA_TOKEN unset)')
      }
      // Wall time measured HERE, around the provider call only — request
      // parsing and auth must not pollute the number the page exists to show.
      const startedAt = Date.now()
      const { imageUrl, costUsd } = await generateQwenImage(opts.deepinfraToken, parsed.data.prompt)
      return { imageUrl, costUsd, durationMs: Date.now() - startedAt }
    },
  )
}
