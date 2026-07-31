// apps/api/src/modules/films/routes.ts
// HTTP layer for CinemaStudio — thin, mirroring modules/entities/routes.ts:
// parse with the SHARED contracts schema, delegate to the service, map domain
// errors to status codes. Every route requires a session; the service scopes
// every query by the caller's id.
import type { FastifyInstance, FastifyReply } from 'fastify'
import {
  addFilmAudioInputSchema,
  addShotReferenceInputSchema,
  createFilmInputSchema,
  createShotInputSchema,
  createStoryboardInputSchema,
  generateShotClipInputSchema,
  reorderShotsInputSchema,
  splitShotInputSchema,
  updateFilmInputSchema,
  updateShotInputSchema,
} from '@opencreate/contracts'
import { FilmNotFoundError, FilmRenderInProgressError, FilmValidationError } from './service'
import type { FilmService } from './service'
import { StoryboardUnavailableError } from './storyboard'
import type { StoryboardService } from './storyboard'
import type { ShotReferenceService } from './shot-references'
import type { ShotSplitService } from './shot-split'

function mapDomainError(error: unknown) {
  if (error instanceof FilmNotFoundError)
    return { status: 404 as const, code: 'not_found' as const, message: 'Film not found' }
  // The reason/subject ride along when the refusal carries them (every buildPlan
  // export refusal does). They are what let the SPA say WHICH shot or track is
  // blocking the export and give the one action that helps, instead of a single
  // "something on the timeline isn't ready" for ten different causes.
  if (error instanceof FilmValidationError)
    return {
      status: 400 as const,
      code: 'validation_failed' as const,
      message: error.message,
      ...(error.reason ? { reason: error.reason } : {}),
      ...(error.subjectKind ? { subjectKind: error.subjectKind } : {}),
      ...(error.subjectId ? { subjectId: error.subjectId } : {}),
    }
  // Already exporting → 409 conflict, not 400: the request is valid, the film's
  // current state is what forbids it. The SPA branches on this code to say
  // "already running" instead of showing it as a failure.
  if (error instanceof FilmRenderInProgressError)
    return { status: 409 as const, code: 'conflict' as const, message: error.message }
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
// `shotRefs` is optional in the SIGNATURE only so a caller that never needs the
// reference routes can omit it; buildApp always wires it. When present it enables
// three routes: attach/detach an image on a shot, and the clip delivery seam.
export function registerFilmRoutes(
  app: FastifyInstance,
  service: FilmService,
  storyboard?: StoryboardService,
  shotRefs?: ShotReferenceService,
  split?: ShotSplitService,
) {
  async function guard<T>(reply: FastifyReply, fn: () => T | Promise<T>) {
    try {
      return await fn()
    } catch (error) {
      const mapped = mapDomainError(error)
      if (!mapped) throw error
      // `status` is the HTTP code; everything else IS the envelope's error object,
      // so spreading carries `reason`/`subjectKind`/`subjectId` through when the
      // refusal has them and omits them when it does not. Consumers that only read
      // `{code, message}` are unaffected — the extra keys are additive.
      const { status, ...body } = mapped
      return reply.status(status).send({ error: body })
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
    // Awaited since the create can now store a cover file. Wrapped in `guard` so
    // a cover the storage layer refuses surfaces as the service's 400 rather than
    // an unhandled rejection — and, because the bytes are written before the row,
    // that refusal leaves no film behind.
    return guard(reply, async () =>
      reply.status(201).send(await service.createFilm(user.id, parsed.data)),
    )
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

  // ── Split a shot at a point (the NLE's split-at-playhead) ─────────────────
  // Registered only when a split service is wired (buildApp always does). The
  // `/split` sub-path carries an extra segment past `:shotId`, so — like the
  // `references`/`clip` routes below — it never collides with the parameterized
  // shot routes above. Returns the updated FilmDetail (same shape as
  // GET /api/films/:id) so the client replaces its film cache in ONE write; the
  // split is a pure timeline edit that creates no generation and charges nothing.
  // guard() maps FilmNotFoundError → 404 (foreign film/shot) and the out-of-range
  // FilmValidationError → 400, exactly like every other shot route.
  if (split) {
    app.post<{ Params: { id: string; shotId: string } }>(
      '/api/films/:id/shots/:shotId/split',
      async (req, reply) => {
        const user = await app.requireUser(req)
        const parsed = splitShotInputSchema.safeParse(req.body)
        if (!parsed.success) return badInput(reply, parsed.error.issues[0]?.message ?? 'invalid input')
        return guard(reply, () =>
          split.splitShot(user.id, req.params.id, req.params.shotId, parsed.data.atMs),
        )
      },
    )
  }

  // ── Shot references (attach arbitrary images to a shot) ───────────────────
  // Registered only when a shot-reference service is wired (buildApp always does).
  // The `references` and `clip` sub-paths carry an extra segment past `:shotId`, so
  // they never collide with the parameterized shot routes above.
  if (shotRefs) {
    // Attach an image → 201 with the UPDATED shot (its new referenceImages array
    // and the shared budget it now occupies). The service enforces the budget and
    // rejects a non-image/svg/oversize payload BEFORE storing.
    app.post<{ Params: { id: string; shotId: string } }>(
      '/api/films/:id/shots/:shotId/references',
      async (req, reply) => {
        const user = await app.requireUser(req)
        const parsed = addShotReferenceInputSchema.safeParse(req.body)
        if (!parsed.success) return badInput(reply, parsed.error.issues[0]?.message ?? 'invalid input')
        return guard(reply, async () =>
          reply
            .status(201)
            .send(await shotRefs.addReference(user.id, req.params.id, req.params.shotId, parsed.data.dataUri)),
        )
      },
    )
    // Detach an image → 200 with the updated shot (a body, so not 204).
    app.delete<{ Params: { id: string; shotId: string; refId: string } }>(
      '/api/films/:id/shots/:shotId/references/:refId',
      async (req, reply) => {
        const user = await app.requireUser(req)
        return guard(reply, () =>
          shotRefs.removeReference(user.id, req.params.id, req.params.shotId, req.params.refId),
        )
      },
    )
    // The DELIVERY SEAM: generate the shot's clip. The server reads the shot's
    // attached images into the server-only referenceImages channel and calls the
    // generation service — so a client can never inject reference-image bytes. It
    // spends provider money (create()), so it gets the SAME strict bucket as
    // POST /api/generations; 201 = image finished sync, 202 = video accepted async.
    // Wrapped in guard() so a foreign shot 404s (and create() is never reached);
    // create()'s own domain errors (validation/provider/content) fall through to
    // the central handler, exactly like the assets3d extract/mesh routes.
    app.post<{ Params: { id: string; shotId: string } }>(
      '/api/films/:id/shots/:shotId/clip',
      { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
      async (req, reply) => {
        const user = await app.requireUser(req)
        const parsed = generateShotClipInputSchema.safeParse(req.body)
        if (!parsed.success) return badInput(reply, parsed.error.issues[0]?.message ?? 'invalid input')
        return guard(reply, async () => {
          const { dto, created } = await shotRefs.createClip(
            user.id,
            req.params.id,
            req.params.shotId,
            parsed.data,
            req.log,
          )
          return reply.status(created ? 201 : 202).send(dto)
        })
      },
    )
  }

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
