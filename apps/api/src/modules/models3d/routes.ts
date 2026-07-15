// HTTP layer for Studio3D renders + shares — thin, mirroring films/routes.ts:
// parse with the SHARED contracts schema, delegate to the service, map domain
// errors to status codes.
//
// Every route here requires a session EXCEPT `GET /api/share/:token`, which is the
// one deliberately public read in the app (that is the entire point of a share
// link). Its handler takes no user, and the service's resolveShare returns a payload
// that carries nothing but the model — see the note there.
import type { FastifyInstance, FastifyReply } from 'fastify'
import { createModelRenderInputSchema } from '@opencreate/contracts'
import { InvalidImageDataUriError } from '../../storage/dataUri'
import { NotFoundError, ValidationError } from '../generations/service'
import type { Models3dService } from './service'

function mapDomainError(error: unknown) {
  if (error instanceof NotFoundError)
    return { status: 404 as const, code: 'not_found' as const, message: error.message }
  if (error instanceof ValidationError)
    return { status: 400 as const, code: 'validation_failed' as const, message: error.message }
  // A rejected upload is the CLIENT's fault. Without this arm it would fall through
  // to the generic handler and become a 500 — which is exactly what an svg poster
  // used to do before dataUri.ts grew its own error class.
  if (error instanceof InvalidImageDataUriError)
    return { status: 400 as const, code: 'validation_failed' as const, message: error.message }
  return null
}

function fail(reply: FastifyReply, error: unknown) {
  const mapped = mapDomainError(error)
  if (!mapped) throw error
  return reply.status(mapped.status).send({ error: { code: mapped.code, message: mapped.message } })
}

// 45MB on the render route ONLY. The app-wide bodyLimit is 15MB (app.ts) and must
// STAY there — it is the guard on every other endpoint, and raising it globally to
// suit one upload would widen the DoS surface of the whole API. A 6s 1080p turntable
// is ~3-8MB, base64-inflates by ~37%, and 4K needs the headroom.
const RENDER_BODY_LIMIT = 45 * 1024 * 1024
// A render spawns ffmpeg — a much stricter bucket than reads, same as film renders.
const RENDER_RATE_LIMIT = { max: 10, timeWindow: '1 minute' }

export function registerModels3dRoutes(app: FastifyInstance, service: Models3dService) {
  app.post<{ Params: { generationId: string } }>(
    '/api/models/:generationId/renders',
    { bodyLimit: RENDER_BODY_LIMIT, config: { rateLimit: RENDER_RATE_LIMIT } },
    async (req, reply) => {
      const user = await app.requireUser(req)
      const parsed = createModelRenderInputSchema.safeParse(req.body)
      if (!parsed.success)
        return reply
          .status(400)
          .send({ error: { code: 'validation_failed', message: 'Invalid render input' } })
      try {
        const render = await service.createRender(user.id, req.params.generationId, parsed.data)
        // 201, not 202: the browser already rendered: by the time this returns, the
        // row is settled. A 202 would tell the SPA to start polling something that
        // has already finished.
        return reply.status(201).send(render)
      } catch (error) {
        return fail(reply, error)
      }
    },
  )

  app.get<{ Params: { generationId: string } }>(
    '/api/models/:generationId/renders',
    async (req, reply) => {
      const user = await app.requireUser(req)
      try {
        return reply.send({ items: service.listRenders(user.id, req.params.generationId) })
      } catch (error) {
        return fail(reply, error)
      }
    },
  )

  app.get<{ Params: { id: string } }>('/api/model-renders/:id', async (req, reply) => {
    const user = await app.requireUser(req)
    try {
      return reply.send(service.getRender(user.id, req.params.id))
    } catch (error) {
      return fail(reply, error)
    }
  })

  app.delete<{ Params: { id: string } }>('/api/model-renders/:id', async (req, reply) => {
    const user = await app.requireUser(req)
    try {
      await service.deleteRender(user.id, req.params.id)
      return reply.status(204).send()
    } catch (error) {
      return fail(reply, error)
    }
  })

  app.post<{ Params: { generationId: string } }>(
    '/api/models/:generationId/share',
    async (req, reply) => {
      const user = await app.requireUser(req)
      try {
        // 201 on both the first share and a repeat: share() is idempotent (one token
        // per model, enforced by a unique index), so a second click returns the SAME
        // token rather than minting a second live one.
        return reply.status(201).send(service.share(user.id, req.params.generationId))
      } catch (error) {
        return fail(reply, error)
      }
    },
  )

  app.delete<{ Params: { generationId: string } }>(
    '/api/models/:generationId/share',
    async (req, reply) => {
      const user = await app.requireUser(req)
      try {
        service.revokeShare(user.id, req.params.generationId)
        return reply.status(204).send()
      } catch (error) {
        return fail(reply, error)
      }
    },
  )

  // PUBLIC — no requireUser. The token is the credential.
  app.get<{ Params: { token: string } }>('/api/share/:token', async (req, reply) => {
    try {
      return reply.send(service.resolveShare(req.params.token))
    } catch (error) {
      return fail(reply, error)
    }
  })
}
