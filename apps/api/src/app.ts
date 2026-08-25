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
import { createRunwareMeshAdapter } from './integrations/runware/mesh-adapter'
import { createComfyClient } from './integrations/runpod/comfy-client'
import { createArkClient } from './integrations/bytedance/ark-client'
import { createDashscopeClient } from './integrations/alibaba/dashscope-client'
import { createDeepinfraClient } from './integrations/deepinfra/deepinfra-client'
import { createKieClient } from './integrations/kie/kie-video'
import { createSegmindClient } from './integrations/segmind/segmind-video'
import { createFailoverProvider } from './integrations/failover-provider'
import { createImageFailoverProvider } from './integrations/failover-image-provider'
import type { ImageProvider } from './integrations/image-provider'
import { createKieImageClient } from './integrations/kie/kie-image'
import { createRunwareImageAdapter } from './integrations/runware/image-adapter'
import type { VideoProvider, VideoProviderId } from './integrations/video-provider'
import type { Mesh3dProvider } from './integrations/mesh-provider'
import type { StorageProvider } from './storage/local'
import { createAuth } from './modules/auth/auth'
import { seedDevAdmin, seedSuperAdmin } from './modules/auth/dev-admin'
import { registerAuth } from './modules/auth/plugin'
import { registerCatalogRoutes } from './modules/catalog/routes'
import { registerAnalyticsRoutes } from './modules/analytics/routes'
import { registerCreditRoutes } from './modules/credits/routes'
import { registerEntityRoutes } from './modules/entities/routes'
import { createEntityService } from './modules/entities/service'
import { createPortraitService } from './modules/entities/portraits'
import { createGenerationService, settleStaleGenerations } from './modules/generations/service'
import { registerGenerationRoutes } from './modules/generations/routes'
import { createFilmService, settleStaleRenders } from './modules/films/service'
import { registerFilmRoutes } from './modules/films/routes'
import { createShotReferenceService } from './modules/films/shot-references'
import { createShotSplitService } from './modules/films/shot-split'
import { createStoryboardService } from './modules/films/storyboard'
import { assertTemplatesValid, createTemplateService } from './modules/templates/service'
import { registerTemplateRoutes } from './modules/templates/routes'
import { createAsset3dService } from './modules/assets3d/service'
import { createAnalyzeService } from './modules/assets3d/analyze'
import { registerAsset3dRoutes } from './modules/assets3d/routes'
import { createModels3dService, settleStaleModelRenders } from './modules/models3d/service'
import { registerModels3dRoutes } from './modules/models3d/routes'
import { createPromptEnhanceService } from './modules/prompt/enhance'
import { registerPromptRoutes } from './modules/prompt/routes'
import { registerCompareRoutes } from './modules/compare/routes'
import type { CompareChannel } from './modules/compare/routes'
import { createCanvasService } from './modules/canvas/service'
import { registerCanvasRoutes } from './modules/canvas/routes'
import { createStyleService } from './modules/styles/service'
import { registerStyleRoutes } from './modules/styles/routes'
import { buildBrainChain } from './modules/creator/brain'
import type { Brain } from './modules/creator/brain'
import { buildCreatorTools } from './modules/creator/tools'
import { createCreatorService, settleStaleCreatorSessions } from './modules/creator/service'
import { registerCreatorRoutes } from './modules/creator/routes'
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
  // ComfyUI client) + `config.arkApiKey` (direct ByteDance), so index.ts stays
  // minimal and existing tests that inject only `runware` keep routing video
  // through the Runware adapter unchanged. Routing-focused tests inject an
  // explicit registry to assert which backend ran; the image path never touches
  // this.
  //
  // PARTIAL by design: a routing test that only cares about two backends must not
  // be forced to stub every provider that exists, and the service already resolves
  // a missing entry to Runware (or a clean provider_error). Production always
  // derives the complete registry below.
  videoProviders?: Partial<Record<VideoProviderId, VideoProvider>>
  // MESH provider (Mesh3dProvider seam, Studio3D). Optional: when absent it is
  // DERIVED below from `runware` (the 3dInference adapter). A single provider, not
  // a registry like videoProviders — 'runware' is the only 3D backend built, and
  // 'comfy-3d' is a designed-but-unbuilt self-host seam (ADR D2: hosted TRELLIS.2
  // beats running our own GPU for this). 3D tests inject a fake to assert that a
  // mesh job submits here and NEVER through the video registry.
  meshProvider?: Mesh3dProvider
  // IMAGE provider (ImageProvider seam). Optional: when absent the production
  // chain below is built (Seedream on kie.ai → Runware). Injected by tests that
  // need the ASYNCHRONOUS half of the seam, which is otherwise reachable only by
  // calling kie.ai for real — and by any test that wants to prove a job went to
  // the chain rather than straight to Runware.
  imageProvider?: ImageProvider
  // Optional pino destination override. Tests inject a capture stream to
  // assert on structured log lines; production leaves it unset (stdout).
  logStream?: { write: (msg: string) => void }
  // Per-generation min interval between Runware getResponse calls (service
  // poll throttle). Unset in production (service default 3s); tests inject 0
  // to keep back-to-back poll scripts deterministic, or a real value to
  // exercise the throttle itself.
  pollMinIntervalMs?: number
  // openCreator's brain chain (ADR opencreator-agent D3). Absent → derived below
  // from the ANTHROPIC_API_KEY / DEEPINFRA_TOKEN pair, so production needs no
  // extra wiring and an unset key simply drops its adapter.
  //
  // The override exists because an agent test must be able to SCRIPT the LLM: an
  // HTTP suite that asserts "the budget gate refused this generation" cannot
  // depend on what a real model decides to do (or on having a key at all). An
  // empty array is meaningful too — it is the "nothing configured" case, which
  // must answer with a clean provider_error rather than crash a turn.
  creatorBrains?: Brain[]
  // Hidden /compare-video cost page: the two RAW Seedance 2.0 channels it races.
  // Deliberately NOT read from `videoProviders` — the production registry wraps
  // DeepInfra in a failover chain, and a measurement that silently ran on the
  // FALLBACK would report the wrong provider's price with total confidence. This
  // page must talk to each pipe directly or not at all.
  //
  // Optional: derived from config below. Tests inject scripted providers so the
  // suite never spends provider money on a question it already knows the answer to.
  compareVideoChannels?: {
    deepinfra?: VideoProvider
    kie?: VideoProvider
    segmind?: VideoProvider
  }
  // Poll cadence + give-up deadline for that page, so a test can drive the loop to
  // its timeout branch in milliseconds instead of six real minutes.
  comparePollIntervalMs?: number
  compareDeadlineMs?: number
  // Which channels the cost page runs. Absent → the production default below, which
  // is currently kie ALONE (the DeepInfra account is at zero and its panel could
  // only repeat the same 402). Tests override it to pin the filtering.
  compareChannels?: readonly CompareChannel[]
}

// Errors thrown by modules can carry an HTTP status + our stable ApiError code
// (contracts errors.ts); the central handler below maps them to the envelope.
// `providerDetail` is an upstream's own error code+text (see ArkError): it is
// LOGGED and never serialized — the envelope sends `message`, and a provider
// body can name internals (ModelArk's includes our BytePlus account id).
type HttpError = Error & { statusCode?: number; apiCode?: string; providerDetail?: string }

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
    // A domain error may carry a `providerDetail`: the upstream's own code+text,
    // deliberately kept off `message` because everything below IS serialized to
    // the client (ModelArk's body, for one, names our BytePlus account id). It is
    // the only thing that distinguishes "wrong model id" from "the account never
    // activated this model", so log it — otherwise a 502 reaches an operator as
    // an untraceable `ModelArk HTTP 404`.
    if (typeof err.providerDetail === 'string')
      req.log.warn(
        { event: 'provider_error', apiCode: err.apiCode, detail: err.providerDetail },
        'provider rejected the request',
      )
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
  await registerAuth(app, auth, deps.db)
  // Public runtime auth-provider flags (ADR google-oauth). The SPA reads this to
  // decide whether to render the Google button — a SINGLE source of truth derived
  // from the SAME creds pair that gates the better-auth Google provider, so the
  // button can never drift from what the server actually has wired. No requireUser:
  // it must render on the pre-sign-in auth screen. Registered as a static route,
  // so find-my-way matches it ahead of better-auth's `/api/auth/*` wildcard.
  // Public runtime config for the SPA. Served rather than baked into the bundle
  // because the deploy ships ONE image: changing an analytics domain must not
  // require a rebuild. Contains no secret — the script URL and site domain are
  // both visible in the page source the moment the script loads.
  app.get('/api/config', async () => ({ telemetry: deps.config.telemetry }))
  app.get('/api/auth/config', async () => ({
    googleEnabled: deps.config.googleClientId !== null && deps.config.googleClientSecret !== null,
  }))
  // Dev-only super-admin (admin@dev.local / admin). The env gate is HERE, at
  // the composition root, not inside the seed — one obvious line to audit for
  // "can this reach production?". 'development' exactly: 'test' builds opt in
  // per-test, and 'production' can never match.
  if (deps.config.nodeEnv === 'development') {
    await seedDevAdmin(deps.db, auth, deps.config.signupBonusCredits, app.log)
  }
  // The DEPLOYMENT's super-admin, and the second gate is deliberately different in
  // kind from the first: dev's admin is gated on the ENVIRONMENT because its
  // password is in the source, this one is gated on an operator having supplied a
  // password at all. No env vars, no account — on a public deployment that is the
  // only safe default, and it is why this line has no 'production' check: the
  // credential itself is the permission.
  if (deps.config.superAdmin) {
    await seedSuperAdmin(
      deps.db,
      auth,
      { ...deps.config.superAdmin, name: 'Super Admin' },
      app.log,
    )
  }
  registerUserRoutes(app, deps.db)
  registerCreditRoutes(app, deps.db)
  // Analytics is a READ MODEL over the money path — no table of its own and no
  // write path, so it can register this early and depends on nothing but the db
  // (ADR analytics §1).
  registerAnalyticsRoutes(app, { db: deps.db, creditPriceUsd: deps.config.creditPriceUsd })
  // Which video backends this deployment can actually reach. Runware is always
  // on (its key is required at boot); the two optional providers each light up
  // from their own env var. The catalog route hides the models of any backend
  // that is off, so a user can never select a model that is guaranteed to fail.
  const configuredProviders = new Set<VideoProviderId>(['runware'])
  if (deps.config.comfyBaseUrl !== null) configuredProviders.add('wan-runpod')
  if (deps.config.arkApiKey !== null) configuredProviders.add('bytedance')
  // Alibaba needs BOTH the key and the workspace id (the workspace lives in the
  // request host), and config already nulls them as a pair — so one check is the
  // whole condition.
  if (deps.config.dashscopeApiKey !== null) configuredProviders.add('alibaba')
  if (deps.config.deepinfraToken !== null) configuredProviders.add('deepinfra')
  // Segmind gates seedance-2-0 now that the catalog routes it there. Without the key
  // the model must vanish from /api/catalog rather than sit there as a broken option:
  // a listed model whose backend cannot run is worse than an absent one.
  if (deps.config.segmindApiKey !== null) configuredProviders.add('segmind')
  // kie gates seedance-1-5-pro since it moved there (2026-08-19). Same rule as
  // every other optional backend: no key, no listing — a model the user can pick
  // but nothing can run is worse than one that is simply absent.
  if (deps.config.kieApiKey !== null) configuredProviders.add('kie')
  // Catalog is public (no requireUser): pricing must render before sign-in.
  registerCatalogRoutes(app, configuredProviders)
  // The core (Task 10): generation lifecycle service gets the db + provider +
  // storage trio; routes stay thin and session-gated via requireUser. The
  // base logger is the fallback for money-path events — routes pass req.log
  // per call so those lines carry the request's reqId.
  // Video provider registry: use the injected one, else derive the production
  // default — Runware wrapped as a VideoProvider, plus the wan-runpod ComfyUI
  // client. The comfy client is ALWAYS registered even when COMFY_BASE_URL is
  // unset (it then returns a clean provider_error on submit), so the wan-2-2
  // catalog entry can be listed without the pod configured and boot never fails.
  // Every provider is ALWAYS registered, even when its env is unset — an
  // unconfigured client returns a clean provider_error on submit rather than
  // exploding at boot, which is what lets the catalog entries exist (and the
  // routing tests run) without a pod or an ByteDance key present.
  // The direct ByteDance channel for Seedance 2.0, kept as its own value so the
  // failover chain below can hold it as a SECOND link without constructing it twice.
  const arkClient = createArkClient({ apiKey: deps.config.arkApiKey })

  const videoProviders: Record<VideoProviderId, VideoProvider> = {
    runware: createRunwareVideoAdapter(deps.runware),
    'wan-runpod': createComfyClient({ baseUrl: deps.config.comfyBaseUrl }),
    bytedance: arkClient,
    // Seedance 1.5 Pro's channel. A single adapter, not a chain: the Runware
    // fallback would need the OLD AIR, and this seam carries one model handle —
    // so a second link here would be handed an id it cannot read. If a Runware
    // key ever returns, the honest way back is a second catalogue entry, not a
    // chain that guesses which spelling it is holding.
    kie: createKieClient({ apiKey: deps.config.kieApiKey }),
    alibaba: createDashscopeClient({
      apiKey: deps.config.dashscopeApiKey,
      workspaceId: deps.config.dashscopeWorkspaceId,
    }),
    // SEEDANCE 2.0 IS A CHAIN, NOT A PROVIDER. The catalog names `deepinfra` as its
    // backend and that is still true — it is where the chain STARTS — but if
    // DeepInfra cannot take the job (out of balance, 5xx, network), the same
    // request walks on to the direct ByteDance channel without the user ever
    // learning that anything happened. They picked "Auteur"; whose GPUs render it
    // is our problem.
    //
    // Today taught us why: the Runware balance ran dry and PixVerse, Seedance 1.5,
    // Kling, Veo, voiceover AND music died together. One dead account, six dead
    // features. A chain turns that into a slower request.
    //
    // The order is deliberate. DeepInfra first because it needs no resource pack;
    // ByteDance second because it will only ever answer once a $30.10 pack is
    // bought, and until then it fails fast and costs nothing to have in the chain.
    // A cheaper third link (PiAPI, fal, Replicate) drops in as one more entry —
    // that seam is most of the value here, since today only one link can actually
    // answer.
    //
    // Failover happens at SUBMIT ONLY, and never on a content refusal. Both rules
    // are money rules; failover-provider.ts explains what each one costs to get
    // wrong.
    // seedance-2-0 routes HERE as of 2026-08-02. Segmind leads the chain because it
    // is the only channel whose published rate survived a real invoice: a 15s/1080p
    // render billed $5.12 against a $5.10 prediction, i.e. $7.02/M versus the $7.00
    // they advertise. DeepInfra advertises the same $7.00 and bills a measured $7.70.
    //
    // DeepInfra stays SECOND rather than being deleted: it is 9% dearer but proven,
    // and a chain that drops to it costs pennies more than one that fails outright.
    // ByteDance stays third — it can only answer once a $30.10 pack is bought, so
    // until then it fails fast and costs nothing to keep.
    segmind: createFailoverProvider(
      [
        {
          id: 'segmind',
          provider: createSegmindClient({ apiKey: deps.config.segmindApiKey, log: app.log }),
        },
        { id: 'deepinfra', provider: createDeepinfraClient({ apiKey: deps.config.deepinfraToken }) },
        { id: 'bytedance', provider: arkClient },
      ],
      {
        onFailover: ({ from, to, reason }) =>
          app.log.warn({ event: 'provider.failover', from, to, reason }, 'video provider failed over'),
      },
    ),
    deepinfra: createFailoverProvider(
      [
        { id: 'deepinfra', provider: createDeepinfraClient({ apiKey: deps.config.deepinfraToken }) },
        { id: 'bytedance', provider: arkClient },
      ],
      {
        // A chain that silently absorbs a dead provider HIDES a dead provider: the
        // fallback quietly becomes the permanent path and nobody finds out until it
        // dies too. Every hop is a warn line.
        onFailover: ({ from, to, reason }) =>
          app.log.warn({ event: 'provider.failover', from, to, reason }, 'video provider failed over'),
      },
    ),
    // A test-injected registry overrides the derived defaults per provider, so a
    // routing test can stub just the two backends it asserts on.
    ...deps.videoProviders,
  }
  // Studio3D (ADR: photo-to-3d-studio). Only the runware backend is built
  // ('comfy-3d' is the designed-but-unbuilt self-host seam), so this is a single
  // adapter, not a registry. It rides the same Runware key the image path already
  // requires at boot, so there is no new env var and no on/off gate: the model3d
  // catalog entries are always reachable.
  const meshProvider: Mesh3dProvider = deps.meshProvider ?? createRunwareMeshAdapter(deps.runware)
  // One entity service instance, shared: the generation service needs it to
  // resolve tagged mentions, and the entity routes expose the same rules.
  const entityService = createEntityService({ db: deps.db, storage: deps.storage })
  // Style registry (ADR style-studio D1). Constructed BEFORE the generation
  // service because that one resolves a style on every styled create — the
  // dependency runs styles → generations, never back, which is why this service
  // takes only the db and reads a cited preview generation's row directly (the
  // acyclicity choice entities/service.ts documents on copyGeneratedAsset).
  // It spends nothing: a preview is an ordinary POST /api/generations.
  // Storage joined the registry with the reference package (amendment A1): a
  // style now carries uploaded images, and they land in the SAME STORAGE_DIR
  // every other user-supplied image does (entity photos, shot references), so
  // there is one place to sweep and one place to serve /media from.
  const styleService = createStyleService({ db: deps.db, storage: deps.storage })
  registerStyleRoutes(app, styleService)
  // Hoisted to a const (it used to be constructed inline in the register call)
  // because Soul Studio's portrait orchestrator needs THIS instance: it is the
  // single money path, and a second instance would mean a second poll-throttle map.
  // The IMAGE chain: Seedream on kie.ai first, Runware behind it. Two links and
  // not one because a single vendor IS the outage — the day Runware's balance ran
  // dry it took every video model, voiceover and music with it, and images would
  // have gone too. Order is deliberate: kie.ai is the cheaper, newer model family
  // we now sell; Runware is the proven path that also happens to accept the
  // reference form kie cannot (data URIs), which is what makes it a real fallback
  // for tagged-entity work in dev rather than a second way to fail.
  //
  // A catalogue entry with no `kie` mapping never reaches the first link at all
  // (the chain filters on the per-backend handle), so an unconfigured or
  // Runware-only model costs nothing here.
  const imageProvider = deps.imageProvider ?? createImageFailoverProvider(
    [
      { id: 'kie', provider: createKieImageClient({ apiKey: deps.config.kieApiKey }) },
      { id: 'runware', provider: createRunwareImageAdapter(deps.runware) },
    ],
    {
      onFailover: ({ from, to, reason }) =>
        app.log.warn({ event: 'provider.failover', from, to, reason }, 'image provider failed over'),
    },
  )

  const generationService = createGenerationService({
    db: deps.db,
    runware: deps.runware,
    videoProviders,
    meshProvider,
    imageProvider,
    mediaPublicBaseUrl: deps.config.mediaPublicBaseUrl,
    storage: deps.storage,
    entities: entityService,
    // The registry lookup, narrowed to the ONE question the money path asks
    // (ADR style-studio D3). Passing the function rather than styleService keeps
    // create/update/delete — and now the reference uploads too — out of reach of
    // the generation service entirely.
    resolveStyle: styleService.resolveStyle,
    log: app.log,
    // undefined → the service's own 3s default; only tests override this.
    ...(deps.pollMinIntervalMs !== undefined ? { pollMinIntervalMs: deps.pollMinIntervalMs } : {}),
  })
  registerGenerationRoutes(app, generationService)
  // Entity library (characters/objects/places) + Soul Studio's reference sheet.
  //
  // The portrait service is a third, tiny service that depends on BOTH of the
  // above; neither depends on IT, which is what keeps the graph acyclic (the
  // generation service already depends on entities, to resolve `[[e1]]` mentions).
  // It spends no credits of its own — it calls generationService.create() N times
  // and lets the one money path do the only thing it does.
  const portraitService = createPortraitService({
    entities: entityService,
    generations: generationService,
  })
  registerEntityRoutes(app, entityService, portraitService)
  // CinemaStudio (ADR cinema-studio): films/shots/audio + ffmpeg renders, plus
  // the optional script→storyboard endpoint. The film service owns the render
  // pipeline (ffmpeg spawn, semaphore-bounded); the storyboard service gates on
  // the optional ANTHROPIC_API_KEY (unset → the endpoint answers provider_error,
  // boot stays healthy). Both scope every query by the caller's id.
  const filmService = createFilmService({ db: deps.db, storage: deps.storage })
  // Shot reference images (attach arbitrary images to a shot). A thin sibling of
  // the film service — kept out of the already-oversized films/service.ts — that
  // owns the attach/detach + the clip DELIVERY SEAM. It depends on THIS generation
  // service instance (the single money path): the clip route reads a shot's stored
  // images into the server-only referenceImages channel and calls create(). It
  // spends no credits of its own.
  const shotReferenceService = createShotReferenceService({
    db: deps.db,
    storage: deps.storage,
    generations: generationService,
  })
  // Split-at-playhead (the NLE): a tiny sibling of the film service — kept out of
  // the already-oversized films/service.ts — that re-slices one shot into two in a
  // single transaction. It depends on THIS film service only for its read shape
  // (getFilm returns the FilmDetail the split hands back) and spends no credits of
  // its own: a split cites the same generation, it never creates one.
  const shotSplitService = createShotSplitService({ db: deps.db, films: filmService })
  const storyboardService = createStoryboardService({
    anthropicApiKey: deps.config.anthropicApiKey,
    films: filmService,
  })
  registerFilmRoutes(app, filmService, storyboardService, shotReferenceService, shotSplitService)
  // Template catalog (ADR template-catalog): the /templates gallery and the
  // one-call "instantiate a whole film from this template" endpoint. It writes
  // through the film service (same ownership rules, one transaction) and charges
  // nothing — every shot lands as a draft.
  //
  // assertTemplatesValid runs FIRST and throws: a template whose tier model cannot
  // do its clips' duration or its aspect ratio would be silently re-priced and
  // re-cut at generate time (composeShotClipInput snaps to the nearest legal
  // value). That has to be a failed boot, not a surprise on someone's invoice.
  assertTemplatesValid()
  registerTemplateRoutes(app, createTemplateService({ films: filmService }))
  // Modular 3D Assets (ADR modular-3d-assets): an aggregate that cites generations.
  // It spends NO credits of its own — extract/mesh call generationService.create()
  // (narrowed to create+get), so the one money path does the only thing it does.
  // The concept image is redrawn per part via the server-only referenceImages
  // channel on create(); analyze gates on the optional ANTHROPIC_API_KEY exactly
  // like storyboard (unset → the endpoint answers provider_error, boot stays healthy).
  const asset3dService = createAsset3dService({
    db: deps.db,
    storage: deps.storage,
    generations: generationService,
  })
  const analyzeService = createAnalyzeService({
    anthropicApiKey: deps.config.anthropicApiKey,
    assets: asset3dService,
  })
  registerAsset3dRoutes(app, asset3dService, analyzeService)
  // Studio3D renders + shares (ADR: photo-to-3d-studio §D3, §D7): turntable
  // renders of an already-succeeded model3d generation, plus public share
  // links. Spends no credits of its own (see the module header), so it needs
  // only db + storage — not the generation service.
  const models3dService = createModels3dService({ db: deps.db, storage: deps.storage })
  registerModels3dRoutes(app, models3dService)
  // Prompt enhancer (POST /api/prompt/enhance): a generic, FREE, stateless text
  // transform — rough shot idea → one cinematic Wan prompt, plus a 'soften' mode for
  // content_blocked retries. It runs an ORDERED PROVIDER CHAIN: DeepInfra
  // (DeepSeek-V3) primary → Groq (llama-3.3-70b) free fallback, tried in order and
  // failing over on any provider error (no-balance, 5xx, network, malformed answer).
  // Each provider is included only if its key is set; EITHER key alone is enough, and
  // with NEITHER the endpoint answers provider_error (boot stays healthy — same
  // optional-secret discipline as storyboard). It spends NO credits of its own (it
  // only improves the text of a paid generation), so it takes neither the db nor the
  // generation service — it structurally cannot charge. `app.log` carries the
  // per-provider failover warn lines (event: prompt.provider_failed).
  const promptEnhanceService = createPromptEnhanceService({
    deepinfraToken: deps.config.deepinfraToken,
    groqApiKey: deps.config.groqApiKey,
    log: app.log,
  })
  registerPromptRoutes(app, promptEnhanceService)
  // Hidden /compare utility (model evaluation): a direct synchronous DeepInfra
  // Qwen-Image-Max channel that bypasses the credit ledger — see the module's
  // header for why it is not a generation. Same optional-secret discipline as
  // the enhancer: with no token the route answers 502 provider_error.
  //
  // The same module also serves /api/compare/video: ONE prompt, Seedance 2.0, raced
  // through DeepInfra and kie.ai at byte-identical settings, reporting each side's
  // own billed figure. Both channels are constructed RAW here (no failover wrapper —
  // see AppDeps.compareVideoChannels), and a channel whose key is unset degrades to
  // an error panel so the operator can still measure the half they have.
  registerCompareRoutes(app, {
    deepinfraToken: deps.config.deepinfraToken,
    deepinfraProvider:
      deps.compareVideoChannels?.deepinfra ??
      createDeepinfraClient({ apiKey: deps.config.deepinfraToken }),
    kieProvider:
      deps.compareVideoChannels?.kie ?? createKieClient({ apiKey: deps.config.kieApiKey }),
    // `log` is passed ONLY here, and only for Segmind: its success envelope has never
    // been observed (the owner asked that no credits be spent proving it), so the
    // adapter logs the raw body the first time its tolerant readers miss. Without
    // that, the first paid run would teach us nothing and would have to be repeated.
    segmindProvider:
      deps.compareVideoChannels?.segmind ??
      createSegmindClient({ apiKey: deps.config.segmindApiKey, log: app.log }),
    ...(deps.comparePollIntervalMs !== undefined
      ? { videoPollIntervalMs: deps.comparePollIntervalMs }
      : {}),
    ...(deps.compareDeadlineMs !== undefined ? { videoDeadlineMs: deps.compareDeadlineMs } : {}),
    // segmind + kie (owner decision 2026-08-02). Both accounts are funded; DeepInfra
    // sits at zero, and a panel that can only ever render the same "balance is empty"
    // error is noise on a page whose whole job is to report measurements. Put
    // `'deepinfra'` back in this array once it is topped up — nothing else changes.
    // ALL THREE enabled server-side; the REQUEST narrows from here. /compare-video
    // races whichever are listed, /verify sends exactly one. DeepInfra stays in the
    // list despite its empty balance: on the verify page an operator may legitimately
    // want to see its 402 — and the intersection rule means nothing can widen past
    // this array, so listing a channel is what makes it selectable, not automatic.
    channels: deps.compareChannels ?? ['segmind', 'deepinfra', 'kie'],
  })
  // Canvas Mode (ADR canvas-mode): the node-graph aggregate that CITES
  // generations — CRUD only, zero money code; node runs arrive as ordinary
  // POST /api/generations from the SPA. `storage` is wired for the ONE thing
  // this module writes bytes for: upload-node images.
  //
  // Hoisted to a const (it used to be constructed inline in the register call)
  // because openCreator's tools need THIS instance: the agent writes to the same
  // canvases the SPA edits, and a second instance would be a second writer to
  // the same rows with no shared view of them.
  const canvasService = createCanvasService({ db: deps.db, storage: deps.storage })
  registerCanvasRoutes(app, canvasService)
  // openCreator (ADR opencreator-agent): the chat agent that drives everything
  // above. Its tools are THIN WRAPPERS over the service instances already in
  // scope — entityService, canvasService, generationService — called in-process
  // with the caller's userId, so ownership, capability checks, prices and refunds
  // all stay where they already live. The agent has NO money code of its own: the
  // only spend is generationService.create() behind the confirm gate.
  //
  // `configuredProviders` is handed down so list_models hides a model whose
  // backend is off — the agent must not plan a shot that is guaranteed to fail
  // after charging (the same rule the public catalog route applies).
  //
  // The brain chain is the ONLY new external dependency, and it is optional in
  // exactly the storyboard/enhancer sense: with neither key set the chain is
  // empty and the first turn answers a clean provider_error while the rest of the
  // product keeps working.
  const creatorService = createCreatorService({
    db: deps.db,
    brains: deps.creatorBrains ?? buildBrainChain(deps.config.anthropicApiKey, deps.config.deepinfraToken),
    tools: buildCreatorTools({
      entities: entityService,
      canvas: canvasService,
      generations: generationService,
      configuredProviders,
    }),
    log: app.log,
  })
  registerCreatorRoutes(app, creatorService)
  // Boot-time sweep: settlement is poll-driven (no background workers), so a
  // processing row whose owner never returns would hold its credit charge
  // forever. Fail + refund anything older than the staleness threshold now.
  settleStaleGenerations(deps.db, Date.now(), app.log)
  // Render reaper (no refund — a render has no charge): a render whose ffmpeg
  // process died would hold 'processing' forever with no poller to settle it.
  settleStaleRenders(deps.db, Date.now(), app.log)
  // Model3d render reaper (no refund either — a render has no charge): mirrors
  // the film render reaper above for the same reason (ffmpeg process death
  // must not hold a row 'processing' forever).
  settleStaleModelRenders(deps.db, Date.now(), app.log)
  // Agent-turn reaper (no refund either — a turn spends LLM tokens, not credits;
  // any generation it already started settles through its own poll path). An
  // in-flight turn lives in process memory, so a restart leaves a `running`
  // session that nothing else can move off the spinner.
  settleStaleCreatorSessions(deps.db, Date.now(), app.log)

  // Serve downloaded generation assets at /media/*. Public by design for the
  // MVP: keys are unguessable UUIDs minted by us, and <img>/<video> tags need
  // plain GETs without auth headers. The storage provider decides per request
  // whether that means a local file (@fastify/static's sendFile, path-
  // traversal-guarded) or a 302 to R2's public bucket domain (ADR
  // railway-deployment D2) — `serve: false` below only wires up the sendFile
  // decorator this route (and the SPA fallback further down) both rely on.
  await app.register(fastifyStatic, { root: process.cwd(), serve: false })
  app.get<{ Params: { '*': string } }>('/media/*', async (req, reply) => {
    const result = await deps.storage.serve(`/media/${req.params['*']}`)
    if (result.kind === 'redirect') return reply.redirect(result.url, 302)
    return reply.sendFile(req.params['*'], result.root)
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
      // The decorator-only registration above already added sendFile; a
      // second decoration would throw. sendFile still works here because it
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
