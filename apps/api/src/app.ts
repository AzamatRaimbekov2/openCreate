// buildApp(deps) — DI composition root (plan Task 3). The app is a pure function
// of its dependencies so tests can inject an in-memory config/db (see
// test/helpers/build-test-app.ts) and production boot (index.ts) injects real ones.
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import type { AppConfig } from './config'
import type { Db } from './db/client'
import type { RunwareClient } from './integrations/runware/client'
import type { StorageProvider } from './storage/local'
import { createAuth } from './modules/auth/auth'
import { registerAuth } from './modules/auth/plugin'
import { registerCatalogRoutes } from './modules/catalog/routes'
import { registerCreditRoutes } from './modules/credits/routes'
import { createGenerationService, settleStaleGenerations } from './modules/generations/service'
import { registerGenerationRoutes } from './modules/generations/routes'
import { registerUserRoutes } from './modules/users/routes'

export type AppDeps = {
  config: AppConfig
  db: Db
  // Media storage: assets downloaded from Runware are served from here.
  storage: StorageProvider
  // Runware provider client — injected so tests script it (fakeRunware) and
  // prod boot (index.ts) passes the real REST client. AppDeps is complete now.
  runware: RunwareClient
}

// Errors thrown by modules can carry an HTTP status + our stable ApiError code
// (contracts errors.ts); the central handler below maps them to the envelope.
type HttpError = Error & { statusCode?: number; apiCode?: string }

export async function buildApp(deps: AppDeps) {
  // bodyLimit 15 MiB: inputImage data URIs are allowed up to 14 MB by contract.
  const app = Fastify({ logger: false, bodyLimit: 15 * 1024 * 1024 })

  // Single error → ApiError envelope mapping. `apiCode` (set by domain errors
  // like InsufficientCreditsError or requireUser) wins; otherwise fall back on
  // status heuristics so unexpected errors never leak a non-envelope shape.
  // MUST be set before any `await app.register(...)`: awaiting a register boots
  // the avvio plugin tree, and an error handler set after boot never binds
  // (bit us in Task 9 — 401s regressed to Fastify's default error shape).
  app.setErrorHandler((err: HttpError, _req, reply) => {
    const status = typeof err.statusCode === 'number' ? err.statusCode : 500
    const code = err.apiCode ?? (status === 500 ? 'internal_error' : 'validation_failed')
    reply.status(status).send({ error: { code, message: err.message } })
  })

  app.get('/health', async () => ({ ok: true }))

  // Auth first: it decorates `requireUser`, which every protected module needs.
  const auth = createAuth(deps.db, deps.config)
  await registerAuth(app, auth)
  registerUserRoutes(app, deps.db)
  registerCreditRoutes(app, deps.db)
  // Catalog is public (no requireUser): pricing must render before sign-in.
  registerCatalogRoutes(app)
  // The core (Task 10): generation lifecycle service gets the db + provider +
  // storage trio; routes stay thin and session-gated via requireUser.
  registerGenerationRoutes(
    app,
    createGenerationService({ db: deps.db, runware: deps.runware, storage: deps.storage }),
  )
  // Boot-time sweep: settlement is poll-driven (no background workers), so a
  // processing row whose owner never returns would hold its credit charge
  // forever. Fail + refund anything older than the staleness threshold now.
  settleStaleGenerations(deps.db)

  // Serve downloaded generation assets at /media/* straight off the storage
  // dir. Public by design for the MVP: keys are unguessable UUIDs minted by
  // us, and <img>/<video> tags need plain GETs without auth headers.
  await app.register(fastifyStatic, {
    root: deps.storage.dir,
    prefix: '/media/',
    index: false,
    list: false,
  })

  return app
}
