// apps/api/src/modules/assets3d/routes.ts
// HTTP layer for Modular 3D Assets — thin, mirroring films/routes.ts. Every route
// requires a session; the service scopes every query by the caller's id. Extract
// and mesh SPEND CREDITS (through generationService.create) so they get strict
// rate-limit buckets; analyze spends LLM tokens and gets its own. Domain errors
// map to the ApiError envelope; anything unmapped RETHROWS to the central handler.
import type { FastifyInstance, FastifyReply } from 'fastify'
import {
  createAsset3dInputSchema,
  createAsset3dPartInputSchema,
  meshPartInputSchema,
  updateAsset3dInputSchema,
  updateAsset3dPartInputSchema,
} from '@opencreate/contracts'
import { Asset3dNotFoundError, Asset3dValidationError } from './service'
import type { Asset3dService } from './service'
import { Asset3dAnalyzeUnavailableError } from './analyze'
import type { AnalyzeService } from './analyze'

function mapDomainError(error: unknown) {
  if (error instanceof Asset3dNotFoundError)
    return { status: 404 as const, code: 'not_found' as const, message: 'Asset not found' }
  if (error instanceof Asset3dValidationError)
    return { status: 400 as const, code: 'validation_failed' as const, message: error.message }
  // Analyze provider unavailable (no ANTHROPIC_API_KEY, or a bad completion) → 502
  // provider_error, the same envelope the storyboard/generation paths use.
  if (error instanceof Asset3dAnalyzeUnavailableError)
    return { status: 502 as const, code: 'provider_error' as const, message: error.message }
  return null
}

const EXTRACT_RATE_LIMIT = { max: 20, timeWindow: '1 minute' } // image gens (cheap, iterated)
const MESH_RATE_LIMIT = { max: 10, timeWindow: '1 minute' } // model3d (paid, heavier)
const ANALYZE_RATE_LIMIT = { max: 10, timeWindow: '1 minute' } // LLM tokens

// `analyze` is optional: the route is only registered when a service is wired (it
// always is in buildApp — the service itself gates on the missing key and returns
// a 502, so the endpoint exists but answers provider_error).
export function registerAsset3dRoutes(
  app: FastifyInstance,
  service: Asset3dService,
  analyze?: AnalyzeService,
) {
  async function guard<T>(reply: FastifyReply, fn: () => T | Promise<T>) {
    try {
      return await fn()
    } catch (error) {
      const mapped = mapDomainError(error)
      if (!mapped) throw error // unmapped (e.g. a provider error from create()) → central handler
      return reply.status(mapped.status).send({ error: { code: mapped.code, message: mapped.message } })
    }
  }
  const badInput = (reply: FastifyReply, message: string) =>
    reply.status(400).send({ error: { code: 'validation_failed', message } })

  // ── Assets ──────────────────────────────────────────────────────────────
  app.get('/api/assets3d', async (req) => {
    const user = await app.requireUser(req)
    return { items: service.listAssets(user.id) }
  })
  app.post('/api/assets3d', async (req, reply) => {
    const user = await app.requireUser(req)
    const parsed = createAsset3dInputSchema.safeParse(req.body)
    if (!parsed.success) return badInput(reply, parsed.error.issues[0]?.message ?? 'invalid input')
    return guard(reply, async () => reply.status(201).send(await service.createAsset(user.id, parsed.data)))
  })
  app.get<{ Params: { id: string } }>('/api/assets3d/:id', async (req, reply) => {
    const user = await app.requireUser(req)
    return guard(reply, () => service.getAsset(user.id, req.params.id))
  })
  app.patch<{ Params: { id: string } }>('/api/assets3d/:id', async (req, reply) => {
    const user = await app.requireUser(req)
    const parsed = updateAsset3dInputSchema.safeParse(req.body)
    if (!parsed.success) return badInput(reply, parsed.error.issues[0]?.message ?? 'invalid input')
    return guard(reply, () => service.updateAsset(user.id, req.params.id, parsed.data))
  })
  app.delete<{ Params: { id: string } }>('/api/assets3d/:id', async (req, reply) => {
    const user = await app.requireUser(req)
    return guard(reply, () => {
      service.deleteAsset(user.id, req.params.id)
      return reply.status(204).send()
    })
  })

  // ── Analyze (FREE; self-gates to 502 without the key) ─────────────────────
  if (analyze) {
    app.post<{ Params: { id: string } }>(
      '/api/assets3d/:id/analyze',
      { config: { rateLimit: ANALYZE_RATE_LIMIT } },
      async (req, reply) => {
        const user = await app.requireUser(req)
        return guard(reply, async () => ({ items: await analyze.analyze(user.id, req.params.id) }))
      },
    )
  }

  // ── Parts ─────────────────────────────────────────────────────────────────
  app.post<{ Params: { id: string } }>('/api/assets3d/:id/parts', async (req, reply) => {
    const user = await app.requireUser(req)
    const parsed = createAsset3dPartInputSchema.safeParse(req.body)
    if (!parsed.success) return badInput(reply, parsed.error.issues[0]?.message ?? 'invalid input')
    return guard(reply, async () => reply.status(201).send(await service.addPart(user.id, req.params.id, parsed.data)))
  })
  app.patch<{ Params: { id: string; pid: string } }>('/api/assets3d/:id/parts/:pid', async (req, reply) => {
    const user = await app.requireUser(req)
    const parsed = updateAsset3dPartInputSchema.safeParse(req.body)
    if (!parsed.success) return badInput(reply, parsed.error.issues[0]?.message ?? 'invalid input')
    return guard(reply, () => service.updatePart(user.id, req.params.id, req.params.pid, parsed.data))
  })
  app.delete<{ Params: { id: string; pid: string } }>('/api/assets3d/:id/parts/:pid', async (req, reply) => {
    const user = await app.requireUser(req)
    return guard(reply, () => {
      service.deletePart(user.id, req.params.id, req.params.pid)
      return reply.status(204).send()
    })
  })

  // ── Extract (paid image gen) → 200 sync ───────────────────────────────────
  app.post<{ Params: { id: string; pid: string } }>(
    '/api/assets3d/:id/parts/:pid/extract',
    { config: { rateLimit: EXTRACT_RATE_LIMIT } },
    async (req, reply) => {
      const user = await app.requireUser(req)
      return guard(reply, async () => service.extract(user.id, req.params.id, req.params.pid))
    },
  )
  // ── Mesh (paid model3d gen) → 202 async ───────────────────────────────────
  app.post<{ Params: { id: string; pid: string } }>(
    '/api/assets3d/:id/parts/:pid/mesh',
    { config: { rateLimit: MESH_RATE_LIMIT } },
    async (req, reply) => {
      const user = await app.requireUser(req)
      const parsed = meshPartInputSchema.safeParse(req.body)
      if (!parsed.success) return badInput(reply, parsed.error.issues[0]?.message ?? 'invalid input')
      return guard(reply, async () =>
        reply.status(202).send(await service.mesh(user.id, req.params.id, req.params.pid, parsed.data)),
      )
    },
  )
}
