// apps/api/src/modules/templates/routes.ts
// HTTP layer for the template catalog — thin, mirroring modules/films/routes.ts:
// parse with the SHARED contracts schema, delegate to the service, map domain
// errors to status codes.
//
// ADR: docs/wiki/decisions/template-catalog.md
import type { FastifyInstance, FastifyReply } from 'fastify'
import {
  createFilmFromTemplateInputSchema,
  createFilmsFromTemplateBatchInputSchema,
} from '@opencreate/contracts'
import { FilmNotFoundError, FilmValidationError } from '../films/service'
import { TemplateNotFoundError, TemplateValidationError } from './service'
import type { TemplateService } from './service'

function mapDomainError(error: unknown) {
  if (error instanceof TemplateNotFoundError || error instanceof FilmNotFoundError)
    return { status: 404 as const, code: 'not_found' as const, message: 'Template not found' }
  if (error instanceof TemplateValidationError || error instanceof FilmValidationError)
    return { status: 400 as const, code: 'validation_failed' as const, message: error.message }
  return null
}

// Instantiation writes a film plus nine rows in one transaction. It costs no
// credits, so the ledger is not the backstop here — this bucket is. Generous
// enough that a user comparing templates never hits it; tight enough that a
// script cannot fill someone's library with a thousand films.
const FROM_TEMPLATE_RATE_LIMIT = { max: 20, timeWindow: '1 minute' }

// HALF the single route's bucket, because one call here is up to TWENTY times
// the work: twenty films and ~a hundred shot rows in one transaction. The single
// route's 20/min is sized for a user comparing templates by making one of each;
// nobody sets up ten batches a minute by hand, so 10 leaves ordinary use
// untouched while capping the write amplification a script could aim at the
// database. Still not a money guard — this path spends nothing — it is the same
// "keep a script from filling a library" backstop, scaled to a heavier call.
const FROM_TEMPLATE_BATCH_RATE_LIMIT = { max: 10, timeWindow: '1 minute' }

export function registerTemplateRoutes(app: FastifyInstance, service: TemplateService) {
  async function guard<T>(reply: FastifyReply, fn: () => T | Promise<T>) {
    try {
      return await fn()
    } catch (error) {
      const mapped = mapDomainError(error)
      if (!mapped) throw error
      return reply.status(mapped.status).send({ error: { code: mapped.code, message: mapped.message } })
    }
  }

  // The gallery. Session-gated like every other authoring surface — the pitch is
  // free to read, but there is nothing for a logged-out visitor to do with it,
  // and the landing page is where we sell the product.
  //
  // No cache headers: the list is computed from two in-process constants (the
  // template registry and the model catalog), so it is already as cheap as a
  // response gets. The SPA holds it with staleTime: Infinity anyway.
  app.get('/api/templates', async (req) => {
    await app.requireUser(req)
    return { items: service.list() }
  })

  // Instantiate. 201, and the body is the full FilmDetail — the SPA seeds
  // ['film', id] from it and navigates straight into the editor, so the user
  // never sees a loading state between "Создать" and a built timeline.
  //
  // Charges NOTHING. Every shot lands as a draft; credits are spent later, per
  // shot, by a user who has seen what they are paying for.
  app.post(
    '/api/films/from-template',
    { config: { rateLimit: FROM_TEMPLATE_RATE_LIMIT } },
    async (req, reply) => {
      const user = await app.requireUser(req)
      const parsed = createFilmFromTemplateInputSchema.safeParse(req.body)
      if (!parsed.success)
        return reply.status(400).send({
          error: {
            code: 'validation_failed',
            message: parsed.error.issues[0]?.message ?? 'invalid input',
          },
        })
      return guard(reply, () => reply.status(201).send(service.instantiate(user.id, parsed.data)))
    },
  )

  // The batch (ADR: shorts-studio §2). One template, N rows of knob values, N
  // films — created in ONE transaction under ONE server-minted batchId, and
  // charging, like its single-film sibling, NOTHING.
  //
  // 201 with the full FilmDetail of every film, for the same reason the single
  // route returns one: the SPA seeds ['film', id] from each and draws the run
  // board immediately instead of firing N follow-up fetches at the API it just
  // finished writing to.
  //
  // A bad row anywhere is a 400 for the WHOLE request, and nothing is written —
  // the service validates every row before it writes the first. That is the
  // behaviour worth stating on the route because it is the one a caller would
  // otherwise have to guess at: there is no partial success here, and no list of
  // per-row errors to reconcile.
  app.post(
    '/api/films/from-template/batch',
    { config: { rateLimit: FROM_TEMPLATE_BATCH_RATE_LIMIT } },
    async (req, reply) => {
      const user = await app.requireUser(req)
      const parsed = createFilmsFromTemplateBatchInputSchema.safeParse(req.body)
      if (!parsed.success)
        return reply.status(400).send({
          error: {
            code: 'validation_failed',
            message: parsed.error.issues[0]?.message ?? 'invalid input',
          },
        })
      return guard(reply, () =>
        reply.status(201).send(service.instantiateBatch(user.id, parsed.data)),
      )
    },
  )
}
