// apps/api/src/modules/films/routes.ts
// HTTP layer for CinemaStudio — thin, mirroring modules/entities/routes.ts:
// parse with the SHARED contracts schema, delegate to the service, map domain
// errors to status codes. Every route requires a session; the service scopes
// every query by the caller's id.
import type { FastifyInstance, FastifyReply } from 'fastify'
import {
  addFilmAudioInputSchema,
  createFilmInputSchema,
  createShotInputSchema,
  createStoryboardInputSchema,
  reorderShotsInputSchema,
  updateFilmInputSchema,
  updateShotInputSchema,
} from '@opencreate/contracts'
import { FilmNotFoundError, FilmValidationError } from './service'
import type { FilmService } from './service'
import { StoryboardUnavailableError } from './storyboard'
import type { StoryboardService } from './storyboard'

function mapDomainError(error: unknown) {
  if (error instanceof FilmNotFoundError)
    return { status: 404 as const, code: 'not_found' as const, message: 'Film not found' }
  if (error instanceof FilmValidationError)
    return { status: 400 as const, code: 'validation_failed' as const, message: error.message }
  // Storyboard provider unavailable (no ANTHROPIC_API_KEY, or a bad completion)
  // → 502 provider_error, the same envelope the generation path uses.
  if (error instanceof StoryboardUnavailableError)
    return { status: 502 as const, code: 'provider_error' as const, message: error.message }
  return null
}

// A render spawns an ffmpeg process — a much stricter bucket than reads. 10/min
// keeps a user iterating on exports while capping runaway render storms.
const RENDER_RATE_LIMIT = { max: 10, timeWindow: '1 minute' }
// A storyboard call spends real LLM tokens — its own strict bucket.
const STORYBOARD_RATE_LIMIT = { max: 10, timeWindow: '1 minute' }

// `storyboard` is optional: the route is only registered when a service is
// wired (it always is in buildApp — the service itself gates on the missing key
// and returns a 502, so the endpoint exists but answers provider_error).
export function registerFilmRoutes(
  app: FastifyInstance,
  service: FilmService,
  storyboard?: StoryboardService,
) {
  async function guard<T>(reply: FastifyReply, fn: () => T | Promise<T>) {
    try {
      return await fn()
    } catch (error) {
      const mapped = mapDomainError(error)
      if (!mapped) throw error
      return reply.status(mapped.status).send({ error: { code: mapped.code, message: mapped.message } })
    }
  }

  // Shared 400 for a zod parse failure — same envelope the rest of the API uses.
  function badInput(reply: FastifyReply, message: string) {
    return reply.status(400).send({ error: { code: 'validation_failed', message } })
  }

  // ── Films ─────────────────────────────────────────────────────────────────
  app.get('/api/films', async (req) => {
    const user = await app.requireUser(req)
    return { items: service.listFilms(user.id) }
  })

  app.post('/api/films', async (req, reply) => {
    const user = await app.requireUser(req)
    const parsed = createFilmInputSchema.safeParse(req.body)
    if (!parsed.success) return badInput(reply, parsed.error.issues[0]?.message ?? 'invalid input')
    return reply.status(201).send(service.createFilm(user.id, parsed.data))
  })

  app.get<{ Params: { id: string } }>('/api/films/:id', async (req, reply) => {
    const user = await app.requireUser(req)
    return guard(reply, () => service.getFilm(user.id, req.params.id))
  })

  app.patch<{ Params: { id: string } }>('/api/films/:id', async (req, reply) => {
    const user = await app.requireUser(req)
    const parsed = updateFilmInputSchema.safeParse(req.body)
    if (!parsed.success) return badInput(reply, parsed.error.issues[0]?.message ?? 'invalid input')
    return guard(reply, () => service.updateFilm(user.id, req.params.id, parsed.data))
  })

  app.delete<{ Params: { id: string } }>('/api/films/:id', async (req, reply) => {
    const user = await app.requireUser(req)
    return guard(reply, () => {
      service.deleteFilm(user.id, req.params.id)
      return reply.status(204).send()
    })
  })

  // ── Shots ───────────────────────────────────────────────────────────────
  app.post<{ Params: { id: string } }>('/api/films/:id/shots', async (req, reply) => {
    const user = await app.requireUser(req)
    const parsed = createShotInputSchema.safeParse(req.body)
    if (!parsed.success) return badInput(reply, parsed.error.issues[0]?.message ?? 'invalid input')
    return guard(reply, () => reply.status(201).send(service.addShot(user.id, req.params.id, parsed.data)))
  })

  // Reorder is registered BEFORE the parameterized :shotId routes so the literal
  // path segment 'reorder' is never captured as a shot id.
  app.post<{ Params: { id: string } }>('/api/films/:id/shots/reorder', async (req, reply) => {
    const user = await app.requireUser(req)
    const parsed = reorderShotsInputSchema.safeParse(req.body)
    if (!parsed.success) return badInput(reply, parsed.error.issues[0]?.message ?? 'invalid input')
    return guard(reply, () => ({ items: service.reorderShots(user.id, req.params.id, parsed.data.shotIds) }))
  })

  app.patch<{ Params: { id: string; shotId: string } }>(
    '/api/films/:id/shots/:shotId',
    async (req, reply) => {
      const user = await app.requireUser(req)
      const parsed = updateShotInputSchema.safeParse(req.body)
      if (!parsed.success) return badInput(reply, parsed.error.issues[0]?.message ?? 'invalid input')
      return guard(reply, () => service.updateShot(user.id, req.params.id, req.params.shotId, parsed.data))
    },
  )

  app.delete<{ Params: { id: string; shotId: string } }>(
    '/api/films/:id/shots/:shotId',
    async (req, reply) => {
      const user = await app.requireUser(req)
      return guard(reply, () => {
        service.deleteShot(user.id, req.params.id, req.params.shotId)
        return reply.status(204).send()
      })
    },
  )

  // ── Audio ───────────────────────────────────────────────────────────────
  app.post<{ Params: { id: string } }>('/api/films/:id/audio', async (req, reply) => {
    const user = await app.requireUser(req)
    const parsed = addFilmAudioInputSchema.safeParse(req.body)
    if (!parsed.success) return badInput(reply, parsed.error.issues[0]?.message ?? 'invalid input')
    return guard(reply, () => reply.status(201).send(service.addAudio(user.id, req.params.id, parsed.data)))
  })

  app.delete<{ Params: { id: string; audioId: string } }>(
    '/api/films/:id/audio/:audioId',
    async (req, reply) => {
      const user = await app.requireUser(req)
      return guard(reply, () => {
        service.deleteAudio(user.id, req.params.id, req.params.audioId)
        return reply.status(204).send()
      })
    },
  )

  // ── Render ────────────────────────────────────────────────────────────────
  // 202: the render is accepted and processing; the SPA polls the GET below.
  app.post<{ Params: { id: string } }>(
    '/api/films/:id/renders',
    { config: { rateLimit: RENDER_RATE_LIMIT } },
    async (req, reply) => {
      const user = await app.requireUser(req)
      return guard(reply, () => reply.status(202).send(service.createRender(user.id, req.params.id)))
    },
  )

  app.get<{ Params: { id: string; renderId: string } }>(
    '/api/films/:id/renders/:renderId',
    async (req, reply) => {
      const user = await app.requireUser(req)
      return guard(reply, () => service.getRender(user.id, req.params.id, req.params.renderId))
    },
  )

  // ── Storyboard ──────────────────────────────────────────────────────────
  // Registered only when a storyboard service is provided. Returns the created
  // DRAFT shots; nothing is generated or charged until the user presses Generate.
  if (storyboard) {
    app.post<{ Params: { id: string } }>(
      '/api/films/:id/storyboard',
      { config: { rateLimit: STORYBOARD_RATE_LIMIT } },
      async (req, reply) => {
        const user = await app.requireUser(req)
        const parsed = createStoryboardInputSchema.safeParse(req.body)
        if (!parsed.success) return badInput(reply, parsed.error.issues[0]?.message ?? 'invalid input')
        return guard(reply, async () => ({
          items: await storyboard.generate(user.id, req.params.id, parsed.data),
        }))
      },
    )
  }
}
