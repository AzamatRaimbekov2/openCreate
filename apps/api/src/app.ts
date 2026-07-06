// buildApp(deps) — DI composition root (plan Task 3). The app is a pure function
// of its dependencies so tests can inject an in-memory config/db (see
// test/helpers/build-test-app.ts) and production boot (index.ts) injects real ones.
import Fastify from 'fastify'
import type { AppConfig } from './config'

export type AppDeps = {
  config: AppConfig
  // added in later tasks: db, runware, storage
}

// Errors thrown by modules can carry an HTTP status + our stable ApiError code
// (contracts errors.ts); the central handler below maps them to the envelope.
type HttpError = Error & { statusCode?: number; apiCode?: string }

export async function buildApp(deps: AppDeps) {
  void deps // config consumed from Task 4 onward (db/auth wiring)
  // bodyLimit 15 MiB: inputImage data URIs are allowed up to 14 MB by contract.
  const app = Fastify({ logger: false, bodyLimit: 15 * 1024 * 1024 })

  app.get('/health', async () => ({ ok: true }))

  // Single error → ApiError envelope mapping. `apiCode` (set by domain errors
  // like InsufficientCreditsError or requireUser) wins; otherwise fall back on
  // status heuristics so unexpected errors never leak a non-envelope shape.
  app.setErrorHandler((err: HttpError, _req, reply) => {
    const status = typeof err.statusCode === 'number' ? err.statusCode : 500
    const code = err.apiCode ?? (status === 500 ? 'internal_error' : 'validation_failed')
    reply.status(status).send({ error: { code, message: err.message } })
  })

  return app
}
