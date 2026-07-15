// apps/api/src/modules/entities/routes.ts
// HTTP layer for the entity library — deliberately thin, mirroring
// modules/generations/routes.ts: parse with the SHARED contracts schema,
// delegate to the service, map domain errors to status codes. Every route
// requires a session; the service scopes every query by the caller's id.
import type { FastifyInstance, FastifyReply } from 'fastify'
import {
  addEntityImageInputSchema,
  createEntityInputSchema,
  createPortraitsInputSchema,
  updateEntityInputSchema,
} from '@opencreate/contracts'
import { InvalidImageDataUriError } from '../../storage/dataUri'
import { SoulRequiredError } from './portraits'
import type { PortraitService } from './portraits'
import { EntityImageInvalidError, EntityNotFoundError, GenerationNotAttachableError } from './service'
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
  if (error instanceof GenerationNotAttachableError) {
    // 400, not 404, and with a message that says NOTHING about which of the four
    // checks failed (not yours / not finished / not an image / no asset). A
    // response that distinguished them would confirm that a given generation id
    // exists on someone else's account.
    return {
      status: 400 as const,
      code: 'validation_failed' as const,
      message: 'That generation cannot be attached to this entity',
    }
  }
  if (error instanceof SoulRequiredError) {
    return {
      status: 400 as const,
      code: 'validation_failed' as const,
      message: 'This character has no soul to render — build one in the constructor first',
    }
  }
  return null
}

// Uploading an image writes to disk and can carry ~14MB — a much stricter bucket
// than the global read limit. 20/min still lets a user add a photo set quickly.
const UPLOAD_RATE_LIMIT = { max: 20, timeWindow: '1 minute' }

// A reference sheet is the most expensive single call in the product: four views
// cost 2 + 3×8 = 26 credits and hold the connection open for four provider
// round-trips. The generation service's own 20/min bucket does not protect this —
// one call there is one image, one call HERE is up to four. 6/min is far above a
// human clicking "generate the sheet" and a hard wall against a script that would
// otherwise drain an account (or our provider quota) in seconds.
const PORTRAIT_RATE_LIMIT = { max: 6, timeWindow: '1 minute' }

export function registerEntityRoutes(
  app: FastifyInstance,
  service: EntityService,
  portraits: PortraitService,
) {
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

  // The body is a UNION now (upload | generated). The upload branch DEFAULTS its
  // source, so the SPA's pre-existing `{ dataUri }` call still parses byte-for-
  // byte as it did before Soul Studio existed.
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

  // Mint the reference sheet. The client asks for VIEWS — never for a model and
  // never for a prompt: both are server-side rules (see portraits.ts), and a
  // client that could choose the model could pick the 2-credit one for a view that
  // needs the 8-credit one and receive a stranger, for a price, silently.
  //
  // Answers 200, not 201/202: the call is a batch of N paid jobs, some of which
  // may have failed and been refunded, so there is no single created resource to
  // point at. The per-view outcomes are in the body.
  app.post<{ Params: { id: string } }>(
    '/api/entities/:id/portraits',
    { config: { rateLimit: PORTRAIT_RATE_LIMIT } },
    async (req, reply) => {
      const sessionUser = await app.requireUser(req)
      const parsed = createPortraitsInputSchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'validation_failed', message: parsed.error.issues[0]?.message ?? 'invalid input' },
        })
      }
      // req.log rides along so the charges/refunds this call causes carry its reqId.
      return guard(reply, () =>
        portraits.create(sessionUser.id, req.params.id, parsed.data, req.log),
      )
    },
  )
}
