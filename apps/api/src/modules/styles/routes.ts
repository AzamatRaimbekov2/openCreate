// apps/api/src/modules/styles/routes.ts
// HTTP layer for the style registry — thin, mirroring canvas/routes.ts: require
// a session, parse with the SHARED contracts schema, delegate, map the two
// domain errors onto the ApiError envelope.
//
// NO RATE BUCKET beyond the global one: this is free text CRUD that writes a
// handful of short columns and spends nothing. The one expensive thing a style
// can lead to — its preview — is an ordinary POST /api/generations, which
// carries the money path's own limits and charges.
import type { FastifyInstance, FastifyReply } from 'fastify'
import {
  addStyleReferenceInputSchema,
  createStyleInputSchema,
  updateStyleInputSchema,
} from '@opencreate/contracts'
import { StyleNotFoundError, StyleValidationError } from './service'
import type { StyleService } from './service'

export function registerStyleRoutes(app: FastifyInstance, service: StyleService) {
  async function guard<T>(reply: FastifyReply, fn: () => T | Promise<T>) {
    try {
      return await fn()
    } catch (error) {
      if (error instanceof StyleNotFoundError) {
        // Same answer for a foreign id as for one that never existed.
        return reply.status(404).send({ error: { code: 'not_found', message: 'Style not found' } })
      }
      if (error instanceof StyleValidationError) {
        return reply
          .status(400)
          .send({ error: { code: 'validation_failed', message: error.message } })
      }
      throw error
    }
  }
  function badInput(reply: FastifyReply, message: string) {
    return reply.status(400).send({ error: { code: 'validation_failed', message } })
  }

  // Builtin + own, one list — the single source every style picker renders from
  // (ADR D5), replacing the SPA's static import of STYLE_PRESETS.
  app.get('/api/styles', async (req) => {
    const user = await app.requireUser(req)
    return { items: service.listStyles(user.id) }
  })

  app.post('/api/styles', async (req, reply) => {
    const user = await app.requireUser(req)
    const parsed = createStyleInputSchema.safeParse(req.body)
    if (!parsed.success) return badInput(reply, parsed.error.issues[0]?.message ?? 'invalid input')
    return reply.status(201).send(service.createStyle(user.id, parsed.data))
  })

  app.patch<{ Params: { id: string } }>('/api/styles/:id', async (req, reply) => {
    const user = await app.requireUser(req)
    const parsed = updateStyleInputSchema.safeParse(req.body)
    if (!parsed.success) return badInput(reply, parsed.error.issues[0]?.message ?? 'invalid input')
    return guard(reply, () => service.updateStyle(user.id, req.params.id, parsed.data))
  })

  app.delete<{ Params: { id: string } }>('/api/styles/:id', async (req, reply) => {
    const user = await app.requireUser(req)
    return guard(reply, () => {
      service.deleteStyle(user.id, req.params.id)
      return reply.status(204).send()
    })
  })

  // The reference half of the package (ADR style-studio A4) — a deliberate
  // mirror of the shot-reference endpoints, down to the status codes: 201 for an
  // upload that created something, 200 for a detach that returns the survivors,
  // and the UPDATED STYLE as the body of both. Returning the whole style rather
  // than the one reference is what lets the constructor re-render its thumbnail
  // strip from one response, with no client-side merge to get wrong.
  //
  // Still no rate bucket of its own: an upload writes one bounded file, and the
  // cap (3) plus the wire's byte limit are the real ceiling here.
  app.post<{ Params: { id: string } }>('/api/styles/:id/references', async (req, reply) => {
    const user = await app.requireUser(req)
    const parsed = addStyleReferenceInputSchema.safeParse(req.body)
    // The zod refusal covers svg and oversize payloads BEFORE the service ever
    // sees them; storage.saveDataUri re-guards the disk regardless.
    if (!parsed.success) return badInput(reply, parsed.error.issues[0]?.message ?? 'invalid input')
    return guard(reply, async () =>
      reply.status(201).send(await service.addReference(user.id, req.params.id, parsed.data.dataUri)),
    )
  })

  app.delete<{ Params: { id: string; refId: string } }>(
    '/api/styles/:id/references/:refId',
    async (req, reply) => {
      const user = await app.requireUser(req)
      // No 404 for an unknown refId — the service treats it as a no-op, so a
      // retried delete answers 200 with the same surviving list.
      return guard(reply, () => service.removeReference(user.id, req.params.id, req.params.refId))
    },
  )
}
