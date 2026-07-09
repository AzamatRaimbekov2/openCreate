// apps/api/src/modules/entities/routes.ts
// HTTP layer for the entity library — deliberately thin, mirroring
// modules/generations/routes.ts: parse with the SHARED contracts schema,
// delegate to the service, map domain errors to status codes. Every route
// requires a session; the service scopes every query by the caller's id.
import type { FastifyInstance, FastifyReply } from 'fastify'
import {
  addEntityImageInputSchema,
  createEntityInputSchema,
  updateEntityInputSchema,
} from '@opencreate/contracts'
import { InvalidImageDataUriError } from '../../storage/dataUri'
import { EntityImageInvalidError, EntityNotFoundError } from './service'
import type { EntityService } from './service'

// The service throws domain errors; HTTP is where they become status codes.
// Kept in one place so a new route cannot forget to map them.
function mapDomainError(error: unknown) {
  if (error instanceof EntityNotFoundError) {
    return { status: 404 as const, code: 'not_found' as const, message: 'Entity not found' }
  }
  if (error instanceof InvalidImageDataUriError) {
    // A rejected upload (svg, malformed base64, oversized) is a CLIENT error.
    // Before this branch it fell through to the central handler as a 500 —
    // caught by an integration test that had been written too loosely (>=400).
    return { status: 400 as const, code: 'validation_failed' as const, message: error.message }
  }
  if (error instanceof EntityImageInvalidError) {
    return {
      status: 400 as const,
      code: 'validation_failed' as const,
      message: 'That image does not belong to this entity',
    }
  }
  return null
}

// Uploading an image writes to disk and can carry ~14MB — a much stricter bucket
// than the global read limit. 20/min still lets a user add a photo set quickly.
const UPLOAD_RATE_LIMIT = { max: 20, timeWindow: '1 minute' }

export function registerEntityRoutes(app: FastifyInstance, service: EntityService) {
  // Every handler funnels through this so a thrown domain error becomes the
  // right envelope instead of a 500 from the central handler.
  async function guard<T>(reply: FastifyReply, fn: () => Promise<T>) {
    try {
      return await fn()
    } catch (error) {
      const mapped = mapDomainError(error)
      // An unmapped error is a real fault — let the central handler own it
      // rather than flattening every bug into a friendly 400.
      if (!mapped) throw error
      return reply
        .status(mapped.status)
        .send({ error: { code: mapped.code, message: mapped.message } })
    }
  }

  app.get('/api/entities', async (req) => {
    const sessionUser = await app.requireUser(req)
    return service.list(sessionUser.id)
  })

  app.post('/api/entities', async (req, reply) => {
    const sessionUser = await app.requireUser(req)
    const parsed = createEntityInputSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'validation_failed', message: parsed.error.issues[0]?.message ?? 'invalid input' },
      })
    }
    const entity = await service.create(sessionUser.id, parsed.data)
    return reply.status(201).send(entity)
  })

  app.get<{ Params: { id: string } }>('/api/entities/:id', async (req, reply) => {
    const sessionUser = await app.requireUser(req)
    return guard(reply, () => service.get(sessionUser.id, req.params.id))
  })

  app.patch<{ Params: { id: string } }>('/api/entities/:id', async (req, reply) => {
    const sessionUser = await app.requireUser(req)
    const parsed = updateEntityInputSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'validation_failed', message: parsed.error.issues[0]?.message ?? 'invalid input' },
      })
    }
    return guard(reply, () => service.update(sessionUser.id, req.params.id, parsed.data))
  })

  app.delete<{ Params: { id: string } }>('/api/entities/:id', async (req, reply) => {
    const sessionUser = await app.requireUser(req)
    return guard(reply, async () => {
      await service.remove(sessionUser.id, req.params.id)
      return reply.status(204).send()
    })
  })

  app.post<{ Params: { id: string } }>(
    '/api/entities/:id/images',
    { config: { rateLimit: UPLOAD_RATE_LIMIT } },
    async (req, reply) => {
      const sessionUser = await app.requireUser(req)
      const parsed = addEntityImageInputSchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'validation_failed', message: parsed.error.issues[0]?.message ?? 'invalid input' },
        })
      }
      return guard(reply, async () => {
        const entity = await service.addImage(sessionUser.id, req.params.id, parsed.data)
        return reply.status(201).send(entity)
      })
    },
  )
}
