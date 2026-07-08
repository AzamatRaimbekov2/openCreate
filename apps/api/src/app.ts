// buildApp(deps) — DI composition root (plan Task 3). The app is a pure function
// of its dependencies so tests can inject an in-memory config/db (see
// test/helpers/build-test-app.ts) and production boot (index.ts) injects real ones.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import Fastify from 'fastify'
import fastifyRateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import type { AppConfig } from './config'
import type { Db } from './db/client'
import type { RunwareClient } from './integrations/runware/client'
import { createRunwareVideoAdapter } from './integrations/runware/video-adapter'
import { createComfyClient } from './integrations/runpod/comfy-client'
import type { VideoProvider, VideoProviderId } from './integrations/video-provider'
import type { StorageProvider } from './storage/local'
import { createAuth } from './modules/auth/auth'
import { registerAuth } from './modules/auth/plugin'
import { registerCatalogRoutes } from './modules/catalog/routes'
import { registerCreditRoutes } from './modules/credits/routes'
import { registerEntityRoutes } from './modules/entities/routes'
import { createEntityService } from './modules/entities/service'
import { createGenerationService, settleStaleGenerations } from './modules/generations/service'
import { registerGenerationRoutes } from './modules/generations/routes'
import { registerUserRoutes } from './modules/users/routes'

export type AppDeps = {
  config: AppConfig
  db: Db
  // Media storage: assets downloaded from Runware are served from here.
  storage: StorageProvider
  // Runware provider client — injected so tests script it (fakeRunware) and
  // prod boot (index.ts) passes the real REST client. Still used directly for
  // the synchronous IMAGE path (never routed through the video registry).
  runware: RunwareClient
  // VIDEO provider registry (VideoProvider seam). Optional: when absent it is
  // DERIVED here from `runware` (adapter) + `config.comfyBaseUrl` (wan-runpod
  // ComfyUI client), so index.ts stays minimal and existing tests that inject
  // only `runware` keep routing video through the Runware adapter unchanged.
  // Routing-focused tests inject an explicit registry to assert which backend
  // ran; the image path never touches this.
  videoProviders?: Record<VideoProviderId, VideoProvider>
  // Optional pino destination override. Tests inject a capture stream to
  // assert on structured log lines; production leaves it unset (stdout).
  logStream?: { write: (msg: string) => void }
  // Per-generation min interval between Runware getResponse calls (service
  // poll throttle). Unset in production (service default 3s); tests inject 0
  // to keep back-to-back poll scripts deterministic, or a real value to
  // exercise the throttle itself.
  pollMinIntervalMs?: number
}

// Errors thrown by modules can carry an HTTP status + our stable ApiError code
// (contracts errors.ts); the central handler below maps them to the envelope.
type HttpError = Error & { statusCode?: number; apiCode?: string }

export async function buildApp(deps: AppDeps) {
  // bodyLimit 15 MiB: inputImage data URIs are allowed up to 14 MB by contract.
  // Logger: pino via Fastify. Level comes from config (LOG_LEVEL, default
  // info; tests pass silent). Session cookies and auth headers are secrets —
  // redact them in EVERY line so no serializer or hand-rolled log can leak
  // them. Fastify's default request logging gives each request a reqId that
  // pino stamps on every req.log line (correlation requirement).
  const app = Fastify({
    // Reverse-proxy header trust (review finding): production terminates TLS
    // in a proxy forwarding everyone from loopback (PROD.md), so without this
    // req.ip — the @fastify/rate-limit bucket key — is ALWAYS the proxy's
    // address: 10 cheap auth requests/min from one attacker would lock every
    // user out of sign-in, and per-client attribution is impossible. false
    // (the default) keeps direct-exposure deploys deaf to client-forged
    // X-Forwarded-For; TRUST_PROXY opts in ('true' or an address/CIDR list).
    trustProxy: deps.config.trustProxy,
    logger: {
      level: deps.config.logLevel,
      redact: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        'headers.authorization',
        'headers.cookie',
      ],
      ...(deps.logStream ? { stream: deps.logStream } : {}),
    },
    bodyLimit: 15 * 1024 * 1024,
  })

  // Single error → ApiError envelope mapping. `apiCode` (set by domain errors
  // like InsufficientCreditsError or requireUser) wins; otherwise fall back on
  // status heuristics so unexpected errors never leak a non-envelope shape.
  // MUST be set before any `await app.register(...)`: awaiting a register boots
  // the avvio plugin tree, and an error handler set after boot never binds
  // (bit us in Task 9 — 401s regressed to Fastify's default error shape).
  app.setErrorHandler((err: HttpError, req, reply) => {
    const status = typeof err.statusCode === 'number' ? err.statusCode : 500
    // Sanitization (ops hardening): an unexpected 5xx — anything WITHOUT a
    // stable apiCode — may carry internals in its message (connection strings,
    // hostnames, stack fragments). Those are operator material: log the full
    // error (pino's err serializer includes the stack) and answer with the
    // fixed generic envelope. Domain errors keep their messages because their
    // messages were WRITTEN for clients ('Not enough credits', …).
    if (!err.apiCode && status >= 500) {
      req.log.error({ err, event: 'unhandled_error' }, 'unhandled error')
      return reply
        .status(status)
        .send({ error: { code: 'internal_error', message: 'Something went wrong' } })
    }
    const code = err.apiCode ?? 'validation_failed'
    reply.status(status).send({ error: { code, message: err.message } })
  })

  // Rate limiting (ops hardening): registered BEFORE any route so the plugin's
  // onRoute hook sees every registration and per-route `config.rateLimit`
  // overrides (strict buckets on /api/auth/* and POST /api/generations) apply.
  // Global default: 300 req/min per IP — generous for the SPA (4s polling ≈ 15
  // req/min per running video), a hard wall for scripted abuse. 429s use the
  // shared ApiError envelope with the stable 'rate_limited' code.
  await app.register(fastifyRateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    // The plugin THROWS this builder's return value (see @fastify/rate-limit
    // index.js), so it lands in the central error handler above — return an
    // Error shaped like our domain errors (statusCode + apiCode) and the
    // handler emits the standard envelope: 429 { error: { rate_limited } }.
    errorResponseBuilder: () => {
      const err = new Error('Too many requests — please slow down') as Error & {
        statusCode: number
        apiCode: string
      }
      err.statusCode = 429
      err.apiCode = 'rate_limited'
      return err
    },
  })

  app.get('/health', async () => ({ ok: true }))

  // Auth first: it decorates `requireUser`, which every protected module needs.
  // app.log is handed down so the signup-bonus hook (a money-path event with
  // no request context) still emits a structured ledger entry.
  const auth = createAuth(deps.db, deps.config, app.log)
  await registerAuth(app, auth)
  registerUserRoutes(app, deps.db)
  registerCreditRoutes(app, deps.db)
  // Catalog is public (no requireUser): pricing must render before sign-in.
  registerCatalogRoutes(app, deps.config.comfyBaseUrl !== null)
  // The core (Task 10): generation lifecycle service gets the db + provider +
  // storage trio; routes stay thin and session-gated via requireUser. The
  // base logger is the fallback for money-path events — routes pass req.log
  // per call so those lines carry the request's reqId.
  // Video provider registry: use the injected one, else derive the production
  // default — Runware wrapped as a VideoProvider, plus the wan-runpod ComfyUI
  // client. The comfy client is ALWAYS registered even when COMFY_BASE_URL is
  // unset (it then returns a clean provider_error on submit), so the wan-2-2
  // catalog entry can be listed without the pod configured and boot never fails.
  const videoProviders: Record<VideoProviderId, VideoProvider> = deps.videoProviders ?? {
    runware: createRunwareVideoAdapter(deps.runware),
    'wan-runpod': createComfyClient({ baseUrl: deps.config.comfyBaseUrl }),
  }
  registerGenerationRoutes(
    app,
    createGenerationService({
      db: deps.db,
      runware: deps.runware,
      videoProviders,
      storage: deps.storage,
      log: app.log,
      // undefined → the service's own 3s default; only tests override this.
      ...(deps.pollMinIntervalMs !== undefined
        ? { pollMinIntervalMs: deps.pollMinIntervalMs }
        : {}),
    }),
  )
  // Entity library (characters/objects/places) — independent of generations for
  // now; the mention wiring into POST /generations lands with the capability flag.
  registerEntityRoutes(app, createEntityService({ db: deps.db, storage: deps.storage }))
  // Boot-time sweep: settlement is poll-driven (no background workers), so a
  // processing row whose owner never returns would hold its credit charge
  // forever. Fail + refund anything older than the staleness threshold now.
  settleStaleGenerations(deps.db, Date.now(), app.log)

  // Serve downloaded generation assets at /media/* straight off the storage
  // dir. Public by design for the MVP: keys are unguessable UUIDs minted by
  // us, and <img>/<video> tags need plain GETs without auth headers.
  await app.register(fastifyStatic, {
    root: deps.storage.dir,
    prefix: '/media/',
    index: false,
    list: false,
  })

  // Production single-origin serving (ops hardening): when the API is the only
  // public process (NODE_ENV=production) AND the built SPA exists, serve it at
  // `/` so app + API share one origin (no CORS, first-party cookies). Gated on
  // index.html actually existing — a prod boot without a web build must still
  // come up as a pure API (e.g. api-only deployments).
  const webDist = deps.config.webDistPath
  if (deps.config.nodeEnv === 'production' && existsSync(join(webDist, 'index.html'))) {
    await app.register(fastifyStatic, {
      root: webDist,
      prefix: '/',
      // The /media registration above already added the sendFile decorator;
      // a second decoration would throw. sendFile still works here because it
      // accepts an explicit root argument (used in the fallback below).
      decorateReply: false,
      index: ['index.html'],
    })
    // SPA fallback: client-routed deep links (/library/xyz) are files that do
    // not exist — answer index.html and let the router take over. API and
    // media misses must stay real 404s (a JSON client should never receive
    // HTML), and non-GETs keep 404 semantics too.
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api') && !req.url.startsWith('/media')) {
        return reply.sendFile('index.html', webDist)
      }
      reply.status(404).send({ error: { code: 'not_found', message: 'Not found' } })
    })
  }

  return app
}
