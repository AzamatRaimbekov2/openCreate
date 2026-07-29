// apps/api/src/modules/canvas/routes.ts
// HTTP layer for the canvas aggregate — thin, mirroring films/routes.ts:
// require a session, parse with the SHARED contracts schema, delegate,
// map CanvasNotFoundError → 404. Node RUNS are not here: they are ordinary
// POST /api/generations calls made by the SPA (ADR D1 — zero new money code).
import type { FastifyInstance, FastifyReply } from 'fastify'
import {
  canvasUploadInputSchema,
  createCanvasInputSchema,
  updateCanvasInputSchema,
} from '@opencreate/contracts'
import { CanvasNotFoundError, CanvasValidationError } from './service'
import type { CanvasService } from './service'

export function registerCanvasRoutes(app: FastifyInstance, service: CanvasService) {
  async function guard<T>(reply: FastifyReply, fn: () => T | Promise<T>) {
    try {
      return await fn()
    } catch (error) {
      if (error instanceof CanvasNotFoundError) {
        return reply.status(404).send({ error: { code: 'not_found', message: 'Canvas not found' } })
      }
      if (error instanceof CanvasValidationError) {
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

  app.get('/api/canvases', async (req) => {
    const user = await app.requireUser(req)
    return { items: service.listCanvases(user.id) }
  })

  app.post('/api/canvases', async (req, reply) => {
    const user = await app.requireUser(req)
    const parsed = createCanvasInputSchema.safeParse(req.body)
    if (!parsed.success) return badInput(reply, parsed.error.issues[0]?.message ?? 'invalid input')
    return reply.status(201).send(service.createCanvas(user.id, parsed.data))
  })

  app.get<{ Params: { id: string } }>('/api/canvases/:id', async (req, reply) => {
    const user = await app.requireUser(req)
    return guard(reply, () => service.getCanvas(user.id, req.params.id))
  })

  app.patch<{ Params: { id: string } }>('/api/canvases/:id', async (req, reply) => {
    const user = await app.requireUser(req)
    const parsed = updateCanvasInputSchema.safeParse(req.body)
    if (!parsed.success) return badInput(reply, parsed.error.issues[0]?.message ?? 'invalid input')
    return guard(reply, () => service.updateCanvas(user.id, req.params.id, parsed.data))
  })

  app.delete<{ Params: { id: string } }>('/api/canvases/:id', async (req, reply) => {
    const user = await app.requireUser(req)
    return guard(reply, () => {
      service.deleteCanvas(user.id, req.params.id)
      return reply.status(204).send()
    })
  })

  // Upload-node bytes. The service saves through storage.saveDataUri (raster
  // only, no svg stored-XSS, decoded-byte cap) and answers the stored
  // '/media/…' path; the CLIENT then writes it into the node's uploadUrl and
  // autosaves. Ownership first — a stranger cannot fill your storage.
  app.post<{ Params: { id: string } }>('/api/canvases/:id/uploads', async (req, reply) => {
    const user = await app.requireUser(req)
    const parsed = canvasUploadInputSchema.safeParse(req.body)
    if (!parsed.success) return badInput(reply, parsed.error.issues[0]?.message ?? 'invalid input')
    return guard(reply, async () =>
      reply.status(201).send(await service.saveUpload(user.id, req.params.id, parsed.data.dataUri)),
    )
  })
}
