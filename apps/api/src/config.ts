// Typed env parsing (plan Task 3). Env vars are validated with Zod at boot so a
// misconfigured deployment fails fast, then mapped to a camelCase AppConfig that
// the rest of the app consumes — no process.env access outside this file.
// Ops hardening: loadEnvFromFile() wraps Node 22's native process.loadEnvFile
// so `pnpm dev` / `db:migrate` pick up the repo-root .env without sourcing.
import { existsSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

// The api package root (apps/api), derived from THIS file's location — both
// src/config.ts and the bundled dist/index.js sit one level below it. Used to
// anchor the WEB_DIST_PATH default so it works no matter what cwd the process
// was started from (repo root `pnpm start` vs apps/api `pnpm dev`).
const pkgRoot = fileURLToPath(new URL('..', import.meta.url))

// Walk up from cwd to the nearest .env (repo root in this workspace). Stops at
// the filesystem root; returns null when no file exists anywhere up the tree.
function findNearestEnvFile(startDir = process.cwd()): string | null {
  let dir = startDir
  for (;;) {
    const candidate = join(dir, '.env')
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

// Guarded native .env loader. Precedence: explicit path arg → ENV_FILE env var
// → nearest .env walking up from cwd. Node's loadEnvFile never overrides vars
// already present in the real environment (verified), and a missing/unreadable
// file is a silent no-op — production platforms inject env directly.
export function loadEnvFromFile(path?: string): void {
  const target = path ?? process.env.ENV_FILE ?? findNearestEnvFile()
  if (!target) return
  try {
    process.loadEnvFile(target)
  } catch {
    // Missing or unreadable file: required vars must come from the real env —
    // envSchema.parse below still fails fast if they don't.
  }
}

// A port that may legitimately be absent. `z.coerce.number()` turns '' into 0,
// so a blank platform variable would otherwise mean "bind port 0" (a random
// free port) — the process would look healthy and be unreachable. Mapping ''
// to undefined lets the next source in the chain answer instead. int/positive
// makes a nonsense value fail at BOOT rather than at first request.
const optionalPort = z.preprocess(
  (v) => (v === '' || v === undefined ? undefined : v),
  z.coerce.number().int().positive().optional(),
)

// zod v4: z.url() is the non-deprecated replacement for z.string().url().
const envSchema = z.object({
  RUNWARE_API_KEY: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url().default('http://localhost:8787'),
  WEB_ORIGIN: z.url().default('http://localhost:5173'),
  // Listening port. TWO sources because managed platforms (ADR
  // railway-deployment) inject `PORT` and expect the process to use it, while
  // this app has always read `API_PORT` — honoring only one of them turns a
  // healthy container into a 502 behind the platform's router, with nothing in
  // the logs to explain it. API_PORT wins when both are set: an operator who
  // typed it meant it. Neither set → 8787, the port EXPOSEd by the Dockerfile.
  // An EMPTY value counts as absent (a dashboard variable left blank) rather
  // than coercing to port 0, which would bind a random port and look "up".
  API_PORT: optionalPort,
  PORT: optionalPort,
  DATABASE_PATH: z.string().default('./data/opencreate.db'),
  STORAGE_DIR: z.string().default('./data/media'),
  SIGNUP_BONUS_CREDITS: z.coerce.number().int().default(200),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // production enables single-origin serving of the built SPA (app.ts).
  NODE_ENV: z.string().default('development'),
  // Where the built SPA lives; relative values are anchored at apps/api.
  WEB_DIST_PATH: z.string().default('../web/dist'),
  // Comma-separated allowlist for better-auth's CSRF origin check; falls back
  // to WEB_ORIGIN below so a single-origin deploy needs no extra config.
  TRUSTED_ORIGINS: z.string().optional(),
  // SSRF gate for asset downloads (storage.saveFromUrl): comma-separated host
  // suffixes the storage layer may fetch from. Provider asset URLs arrive in
  // PROVIDER RESPONSES, so this is default-deny with only Runware's domain —
  // a provider/CDN change becomes an env edit instead of a code change.
  ASSET_HOST_ALLOWLIST: z.string().default('runware.ai'),
  // Asset download limits (review finding): a hard deadline for the whole
  // download and a max size counted while streaming — a stalled provider
  // stream must not hang a settlement forever, and an oversized body must not
  // fill the disk that also holds the SQLite database. Defaults mirror
  // storage/local.ts (120s / 512MB) so an unset env keeps behavior identical.
  ASSET_FETCH_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  ASSET_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(512 * 1024 * 1024),
  // Self-hosted Wan 2.2 provider (ADR: wan-selfhost-video-provider). Base URL of
  // the pod's ComfyUI HTTP API (e.g. https://<podid>-8188.proxy.runpod.net).
  // OPTIONAL: unset keeps boot healthy — the wan-2-2 catalog model is still
  // listed, but a submit returns a clean provider_error instead of crashing. Its
  // host is auto-added to ASSET_HOST_ALLOWLIST below so /view downloads pass the
  // SSRF gate without widening the allowlist by hand.
  // Accept a valid URL, an EMPTY STRING, or absent. `.env`/.env.example ship
  // `COMFY_BASE_URL=` empty (self-host off by default) — `z.url().optional()`
  // rejects empty (optional = absent, not ''), which crashed boot. The `|| null`
  // below then normalizes '' → null (not configured).
  COMFY_BASE_URL: z.union([z.url(), z.literal('')]).optional(),
  // ByteDance ModelArk API key (ADR: seedance-direct-bytedance) — the DIRECT
  // Seedance channel, bypassing the Runware aggregator. OPTIONAL, same
  // treatment as COMFY_BASE_URL: unset keeps boot healthy and simply hides the
  // bytedance-backed models from /api/catalog, so nobody can select a model
  // whose backend cannot run. A plain bearer token (ModelArk does no request
  // signing). `|| null` normalizes '' → null (not configured) below.
  ARK_API_KEY: z.string().optional(),
  // Alibaba Cloud Model Studio (DashScope) — the DIRECT Wan channel. OPTIONAL,
  // same treatment as ARK_API_KEY: unset keeps boot healthy and hides the
  // alibaba-backed models from /api/catalog, so nobody can select a model whose
  // backend cannot run.
  //
  // TWO vars, because their Singapore endpoint puts the workspace IN THE HOST
  // (`https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com`) — there is no
  // account-wide host to fall back on. Both must be set for the provider to
  // count as configured; one without the other is a misconfiguration, not a
  // half-working provider.
  DASHSCOPE_API_KEY: z.string().optional(),
  DASHSCOPE_WORKSPACE_ID: z.string().optional(),
  // DeepInfra bearer token — Seedance 2.0 WITHOUT ByteDance's resource-pack wall,
  // AND the primary LLM for the prompt enhancer (deepseek-ai/DeepSeek-V3-0324).
  // Same treatment as the other optional providers: unset keeps boot healthy and
  // hides its models from /api/catalog, so nobody can select a model whose backend
  // cannot run. `|| null` normalizes '' → null (not configured) below.
  DEEPINFRA_TOKEN: z.string().optional(),
  // Groq API key — the FREE fallback LLM for the prompt enhancer
  // (llama-3.3-70b-versatile), tried when DeepInfra is absent or out of balance.
  // OPTIONAL, same treatment as DEEPINFRA_TOKEN: unset simply drops Groq from the
  // enhancer's provider chain (boot stays healthy). Either key alone is enough for
  // POST /api/prompt/enhance to work; both unset → that endpoint answers
  // provider_error. `|| null` normalizes '' → null (not configured) below. A free
  // key comes from console.groq.com.
  GROQ_API_KEY: z.string().optional(),
  // kie.ai API key — a THIRD Seedance channel (ADR: kie-seedance-channel). Same
  // treatment as the other optional providers: unset keeps boot healthy and hides
  // its models from /api/catalog. Its value is Seedance 1.5 Pro SILENT, measured at
  // $0.0175/s against Runware's $0.0523/s for the same clip — and a real polling
  // endpoint, which DeepInfra lacks. NOT for Seedance 2.0: kie.ai is dearer there
  // ($0.205/s vs a measured $0.1518/s). `|| null` normalizes '' → null below.
  KIE_API_KEY: z.string().optional(),
  // Where OUR stored media is reachable from the PUBLIC internet. Only needed by
  // providers that fetch reference images by URL instead of taking the bytes
  // inline — kie.ai's Seedream is the first (its schema rejects a data URI).
  //
  // Absent → derived from BETTER_AUTH_URL, which is already required to be the
  // public https origin users hit, so a correctly configured deploy needs
  // nothing extra here. Set it explicitly only when media is served from
  // somewhere else than the app's own origin — an R2 public bucket domain, say.
  //
  // Its localhost DEFAULT is the honest answer for dev, not a working one: kie.ai
  // cannot fetch your laptop. The image adapter refuses reference jobs rather
  // than sending a link nobody can resolve, and the failover chain runs them on
  // Runware (which takes data URIs) instead.
  MEDIA_PUBLIC_BASE_URL: z.url().optional(),
  // Segmind API key — the CHEAPEST surveyed channel for Seedance 2.0 (2026-08-02).
  // Every channel bills the same token count, so only the rate per million differs:
  // Segmind holds a FLAT $7.00/M on every resolution, where ByteDance itself charges
  // $7.70/M at 1080p and DeepInfra bills a measured $7.70/M even at 720p. That makes
  // 1080p here cheaper than buying from the manufacturer, with no $29.40 resource
  // pack. Same optional-secret discipline as the others: unset keeps boot healthy
  // and hides its models from /api/catalog. `|| null` normalizes '' → null below.
  SEGMIND_API_KEY: z.string().optional(),
  // Anthropic API key for the CinemaStudio script→storyboard feature. OPTIONAL,
  // same treatment as COMFY_BASE_URL / Google OAuth: unset keeps boot healthy —
  // the /storyboard endpoint then returns a clean provider_error instead of
  // crashing. Any other CinemaStudio feature (timeline, render, generate) works
  // without it. `|| null` normalizes '' → null below.
  ANTHROPIC_API_KEY: z.string().optional(),
  // Reverse-proxy header trust (review finding). Production terminates TLS in
  // a proxy that forwards everyone from loopback (PROD.md), so without this
  // req.ip is ALWAYS the proxy's address and every user shares one rate-limit
  // bucket — 10 cheap auth requests/min lock ALL users out of sign-in.
  // 'true' trusts X-Forwarded-For outright (the proxy MUST then overwrite the
  // inbound header); anything else is passed to fastify verbatim as an
  // address/CIDR/keyword list (e.g. '127.0.0.1', 'loopback,uniquelocal').
  // Unset/empty/'false' = no trust: direct-exposure deploys must never honor
  // a client-forged X-Forwarded-For.
  TRUST_PROXY: z.string().optional(),
  // Cloudflare R2 media storage (ADR railway-deployment D2). ALL FIVE or NONE —
  // enforced below, not by the schema, because zod has no cross-field rule and
  // a half-set group is a misconfiguration that must fail at BOOT, not fall
  // back to local disk silently (the exact trap dashscopeConfigured exists to
  // prevent for DashScope, applied here to five fields instead of two).
  R2_ENDPOINT: z.url().optional(),
  R2_BUCKET: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_PUBLIC_BASE_URL: z.url().optional(),
})

export type LogLevel = z.infer<typeof envSchema.shape.LOG_LEVEL>

export type AppConfig = {
  runwareApiKey: string
  betterAuthSecret: string
  betterAuthUrl: string
  webOrigin: string
  port: number
  databasePath: string
  storageDir: string
  signupBonusCredits: number
  googleClientId: string | null
  googleClientSecret: string | null
  logLevel: LogLevel
  nodeEnv: string
  // Always absolute after loadConfig — app.ts can existsSync it directly.
  webDistPath: string
  // Origins allowed to make cookie-carrying state changes (better-auth CSRF).
  trustedOrigins: string[]
  // Host suffixes storage.saveFromUrl may fetch assets from (SSRF allowlist).
  // Includes the COMFY_BASE_URL host when the wan-runpod provider is configured.
  assetHostAllowlist: string[]
  // Pod ComfyUI base URL for the wan-runpod video provider; null when unset.
  comfyBaseUrl: string | null
  // ByteDance ModelArk bearer token for the direct Seedance provider; null when
  // unset (provider disabled, its catalog models hidden, boot stays healthy).
  arkApiKey: string | null
  // Alibaba Model Studio (DashScope) credentials for the direct Wan provider.
  // BOTH are required together — the workspace id lives in the request HOST, so
  // a key without it cannot form a URL. Null when either is missing (provider
  // disabled, its catalog models hidden, boot stays healthy).
  dashscopeApiKey: string | null
  dashscopeWorkspaceId: string | null
  // DeepInfra bearer token for the pack-free Seedance 2.0 channel AND the prompt
  // enhancer's primary LLM; null when unset (provider disabled, its catalog models
  // hidden, boot stays healthy).
  deepinfraToken: string | null
  // Groq API key — the prompt enhancer's FREE fallback LLM; null when unset (Groq is
  // simply dropped from the enhancer's provider chain, boot stays healthy).
  groqApiKey: string | null
  // kie.ai key for the third Seedance channel; null when unset (provider disabled,
  // its catalog models hidden, boot stays healthy).
  kieApiKey: string | null
  // Absolute, no trailing slash. '/media/<key>.<ext>' appended to it is a URL a
  // provider can GET.
  mediaPublicBaseUrl: string
  // Segmind key for the cheapest Seedance 2.0 channel; null when unset (provider
  // disabled, its models hidden from the catalog).
  segmindApiKey: string | null
  // Anthropic key for the storyboard feature; null when unset (feature disabled,
  // boot stays healthy).
  anthropicApiKey: string | null
  // Asset download limits handed to storage.saveFromUrl: hard deadline for
  // the whole download (ms) and max accepted bytes, counted while streaming.
  assetFetchTimeoutMs: number
  assetMaxBytes: number
  // Fastify trustProxy value: false = never trust proxy headers (default),
  // true = trust X-Forwarded-For from any peer, number = trust exactly N hops
  // counted back from the socket peer (the managed-platform form — see
  // parseTrustProxy), string = fastify/proxy-addr address/CIDR/keyword list of
  // peers whose headers are trusted.
  trustProxy: boolean | number | string
  // Cloudflare R2 credentials + public read domain; null = local disk storage
  // (storage/local.ts). Never partially set — see the ALL FIVE OR NONE check
  // in loadConfig below.
  r2: R2StorageConfig | null
}

export type R2StorageConfig = {
  endpoint: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  publicBaseUrl: string
}

// TRUST_PROXY env → fastify trustProxy. Default-deny: only an explicit opt-in
// makes the app read client identity from X-Forwarded-For. The tri-state keeps
// both deployment shapes safe: direct exposure ignores forgeable headers
// (unset/'false'), the documented reverse-proxy deploy sets 'true' or — better —
// restricts trust to the proxy's own address so even an appended inbound
// X-Forwarded-For chain resolves to the real client (proxy-addr walks from the
// socket peer and stops at the first untrusted hop).
function parseTrustProxy(raw: string | undefined): boolean | number | string {
  const value = raw?.trim() ?? ''
  if (value === '' || value.toLowerCase() === 'false') return false
  if (value.toLowerCase() === 'true') return true
  // A bare non-negative integer is a HOP COUNT, not an address — the form a
  // managed platform needs (ADR railway-deployment R3), where the edge's
  // internal address is neither knowable nor stable, so there is nothing to
  // allowlist. proxy-addr walks the X-Forwarded-For chain from the socket peer
  // inward and stops after N hops: exactly the edge's own contribution is
  // trusted, and any entries the CLIENT prepended are ignored. That closes the
  // gap `true` leaves open — `true` believes the leftmost entry, which is
  // client-controlled whenever the proxy appends instead of overwriting.
  // Matched strictly on digits so '10.0.0.1', '1.5' and '-1' stay address
  // lists: proxy-addr reads the two forms completely differently, and a
  // silently mistyped one would be a security change, not a config typo.
  if (/^\d+$/.test(value)) return Number(value)
  return value
}

// R2_* env → R2StorageConfig | null. Zod validates each field's own shape
// (a set R2_ENDPOINT is a URL, etc) but not the group — this is the
// cross-field rule: all five present → R2 is the storage backend; any subset
// throws at boot rather than quietly running on local disk with, say, no
// public read domain configured (a deploy that "boots fine" and then 500s on
// the first /media/* request).
function loadR2Config(e: z.infer<typeof envSchema>): R2StorageConfig | null {
  const fields = {
    endpoint: e.R2_ENDPOINT,
    bucket: e.R2_BUCKET,
    accessKeyId: e.R2_ACCESS_KEY_ID,
    secretAccessKey: e.R2_SECRET_ACCESS_KEY,
    publicBaseUrl: e.R2_PUBLIC_BASE_URL,
  }
  const setCount = Object.values(fields).filter((v) => v !== undefined && v !== '').length
  if (setCount === 0) return null
  if (setCount < 5)
    throw new Error(
      'R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_PUBLIC_BASE_URL must be set together (R2 storage) or all left unset (local disk storage)',
    )
  return fields as R2StorageConfig
}

export function loadConfig(env?: NodeJS.ProcessEnv): AppConfig {
  // Default boot path (index.ts / migrate.ts): hydrate process.env from the
  // nearest .env first. Callers that pass an explicit env object (tests) stay
  // pure — no file access, no process.env mutation.
  if (!env) {
    loadEnvFromFile()
    env = process.env
  }
  const e = envSchema.parse(env)
  // `|| null` (not `?? null`): an empty COMFY_BASE_URL means "not configured",
  // same treatment as the Google OAuth creds below.
  const comfyBaseUrl = e.COMFY_BASE_URL || null
  const arkApiKey = e.ARK_API_KEY || null
  // BOTH or NEITHER: the workspace id is part of the request HOST, so a key on
  // its own cannot form a URL. Treating a half-set pair as "configured" would
  // list the Wan models in the catalog and then fail every submit — the exact
  // trap the provider-gating exists to prevent.
  const deepinfraToken = e.DEEPINFRA_TOKEN || null
  // `|| null`: an empty string in .env means "not configured", so Groq stays out of
  // the enhancer chain rather than joining it with a blank key.
  const groqApiKey = e.GROQ_API_KEY || null
  // `|| null`: an empty KIE_API_KEY in .env means "not configured", so the channel
  // stays dark rather than joining the registry with a blank key and failing every
  // submit — the exact trap the provider gating exists to prevent.
  const kieApiKey = e.KIE_API_KEY || null
  const segmindApiKey = e.SEGMIND_API_KEY || null
  const dashscopeConfigured = Boolean(e.DASHSCOPE_API_KEY && e.DASHSCOPE_WORKSPACE_ID)
  const dashscopeApiKey = dashscopeConfigured ? (e.DASHSCOPE_API_KEY ?? null) : null
  const dashscopeWorkspaceId = dashscopeConfigured ? (e.DASHSCOPE_WORKSPACE_ID ?? null) : null
  const r2 = loadR2Config(e)
  return {
    runwareApiKey: e.RUNWARE_API_KEY,
    betterAuthSecret: e.BETTER_AUTH_SECRET,
    betterAuthUrl: e.BETTER_AUTH_URL,
    // Trailing slash stripped ONCE, here, so no caller has to think about it:
    // z.url() accepts 'https://host/' and 'https://host' alike, and joining the
    // first with '/media/x' yields a double slash that some CDNs 404 on.
    mediaPublicBaseUrl: (e.MEDIA_PUBLIC_BASE_URL ?? e.BETTER_AUTH_URL).replace(/[/]+$/, ''),
    webOrigin: e.WEB_ORIGIN,
    // Explicit API_PORT → platform-injected PORT → the Dockerfile's EXPOSE.
    port: e.API_PORT ?? e.PORT ?? 8787,
    databasePath: e.DATABASE_PATH,
    storageDir: e.STORAGE_DIR,
    signupBonusCredits: e.SIGNUP_BONUS_CREDITS,
    // `|| null` (not `?? null`): an empty string in .env means "not configured",
    // so Google OAuth stays disabled instead of being created with blank creds.
    googleClientId: e.GOOGLE_CLIENT_ID || null,
    googleClientSecret: e.GOOGLE_CLIENT_SECRET || null,
    logLevel: e.LOG_LEVEL,
    nodeEnv: e.NODE_ENV,
    // Anchor relative paths at the PACKAGE root, not cwd: `pnpm start` runs
    // from the repo root while `pnpm dev` runs from apps/api — the default
    // ../web/dist must mean apps/web/dist in both cases.
    webDistPath: isAbsolute(e.WEB_DIST_PATH) ? e.WEB_DIST_PATH : resolve(pkgRoot, e.WEB_DIST_PATH),
    // Comma list → trimmed allowlist; empty/omitted falls back to the SPA
    // origin so the default dev setup keeps working with zero extra vars.
    trustedOrigins: e.TRUSTED_ORIGINS
      ? e.TRUSTED_ORIGINS.split(',')
          .map((o) => o.trim())
          .filter(Boolean)
      : [e.WEB_ORIGIN],
    // Comma list → trimmed host-suffix allowlist for asset downloads. The
    // schema default ('runware.ai') means a fresh deploy is locked to the
    // provider's own domain unless the operator explicitly widens it. The
    // wan-runpod pod's /view host is folded in below so its finished mp4s pass
    // the SSRF gate — driven entirely by COMFY_BASE_URL, so pointing at a new
    // pod is one env edit with no allowlist bookkeeping.
    assetHostAllowlist: withSegmindHost(
      withKieHost(
      withDeepinfraHost(
      withDashscopeHost(
      withArkHost(
        withComfyHost(
          e.ASSET_HOST_ALLOWLIST.split(',')
            .map((h) => h.trim())
            .filter(Boolean),
          comfyBaseUrl,
        ),
        arkApiKey,
      ),
        dashscopeApiKey,
      ),
      deepinfraToken,
      ),
      kieApiKey,
      ),
      segmindApiKey,
    ),
    assetFetchTimeoutMs: e.ASSET_FETCH_TIMEOUT_MS,
    assetMaxBytes: e.ASSET_MAX_BYTES,
    trustProxy: parseTrustProxy(e.TRUST_PROXY),
    r2,
    comfyBaseUrl,
    arkApiKey,
    dashscopeApiKey,
    dashscopeWorkspaceId,
    deepinfraToken,
    groqApiKey,
    kieApiKey,
    segmindApiKey,
    // `|| null` (not `?? null`): an empty string means "not configured", so the
    // storyboard feature stays disabled rather than initializing with a blank key.
    anthropicApiKey: e.ANTHROPIC_API_KEY || null,
  }
}

// Fold the configured ComfyUI host into the SSRF allowlist (de-duplicated). The
// pod's /view URL is where the finished mp4 is downloaded from, so its exact
// host must be fetchable — but ONLY when a pod is configured, keeping the SSRF
// surface closed by default. An unparseable base URL is ignored (config already
// validated it as a URL, so this is belt-and-braces).
function withComfyHost(allowlist: string[], comfyBaseUrl: string | null): string[] {
  if (!comfyBaseUrl) return allowlist
  let host: string
  try {
    host = new URL(comfyBaseUrl).hostname
  } catch {
    return allowlist
  }
  return allowlist.includes(host) ? allowlist : [...allowlist, host]
}

// Where ModelArk publishes a finished Seedance video. NOT the API's own domain:
// the API lives on *.bytepluses.com but the asset lands on ByteDance's TOS
// object storage under *.volces.com — allowlisting the API domain would pass the
// SSRF gate for zero real downloads and fail every one of them. Verified against
// the ModelArk API docs' example response body (content.video_url =
// https://ark-content-generation-ap-southeast-1.tos-ap-southeast-1.volces.com/…).
//
// The REGION suffix (not the full bucket host) is the allowlist entry: the gate
// matches on an exact-or-dot-boundary basis, so this admits ByteDance's ark
// buckets in ap-southeast-1 and nothing else, while surviving a bucket rename.
// Seedance is served ONLY from ap-southeast-1 (eu-west-1 carries other models),
// so there is no second region to fold in.
export const ARK_ASSET_HOST = 'tos-ap-southeast-1.volces.com'

// Fold the ModelArk asset host into the SSRF allowlist, but ONLY when the direct
// ByteDance provider is actually configured — an unset ARK_API_KEY keeps the
// download surface closed, exactly like the wan-runpod pod host above.
function withArkHost(allowlist: string[], arkApiKey: string | null): string[] {
  if (!arkApiKey) return allowlist
  return allowlist.includes(ARK_ASSET_HOST) ? allowlist : [...allowlist, ARK_ASSET_HOST]
}

// Where Alibaba Model Studio publishes a finished Wan video. Same trap as
// ByteDance: the API host is `*.maas.aliyuncs.com`, but the asset lands on OSS
// object storage under `*.oss-*.aliyuncs.com` — allowlisting the API domain would
// pass the gate for zero real downloads. `aliyuncs.com` is the suffix that admits
// their OSS buckets across region/bucket renames; the gate matches on a dot
// boundary, so it cannot be widened by a lookalike domain.
//
// Their URL dies after 24 HOURS, so storage.saveFromUrl copying it out is not an
// optimization — it is the only reason the asset survives at all.
export const DASHSCOPE_ASSET_HOST = 'aliyuncs.com'

// Fold it in ONLY when the direct Alibaba provider is configured, keeping the
// download surface closed by default — exactly like the two hosts above.
function withDashscopeHost(allowlist: string[], dashscopeApiKey: string | null): string[] {
  if (!dashscopeApiKey) return allowlist
  return allowlist.includes(DASHSCOPE_ASSET_HOST)
    ? allowlist
    : [...allowlist, DASHSCOPE_ASSET_HOST]
}

// Where DeepInfra serves a finished clip. Unlike ByteDance and Alibaba — whose API
// host and asset host are DIFFERENT domains, a trap that would have passed the SSRF
// gate for zero real downloads — DeepInfra serves the video from its own domain.
export const DEEPINFRA_ASSET_HOST = 'deepinfra.com'

// Folded in ONLY when the provider is configured; the download surface stays closed
// by default, exactly like the three hosts above.
function withDeepinfraHost(allowlist: string[], deepinfraToken: string | null): string[] {
  if (!deepinfraToken) return allowlist
  return allowlist.includes(DEEPINFRA_ASSET_HOST)
    ? allowlist
    : [...allowlist, DEEPINFRA_ASSET_HOST]
}

// Where kie.ai serves a finished clip. Back to the ByteDance/Alibaba trap rather
// than DeepInfra's convenience: their API is `api.kie.ai` but the mp4 lands on
// `tempfile.aiquickdraw.com` — an unrelated domain, observed on the live
// verification run 2026-07-30. Allowlisting `kie.ai` would pass the SSRF gate for
// zero real downloads and fail every one of them.
//
// Their URL expires after 24 HOURS, so storage.saveFromUrl copying it out is not an
// optimization — it is the only reason the asset survives at all.
export const KIE_ASSET_HOST = 'tempfile.aiquickdraw.com'

// Where Segmind serves a finished clip. EVIDENCE, not a guess: their own 404 body
// calls `api.segmind.com/v1/requests/{id}` the OUTPUT endpoint ("Output for this
// request ID … Not Found"), and the submit envelope returns that URL as `poll_url`.
//
// CONFIRMED 2026-08-20, and the guess above was half right — which is why this is
// now a LIST. A Seedance 2.0 clip rendered successfully in production and the
// download was refused: «asset host not allowed: images.segmind.com». The prediction
// written here (that a provider serving files from a host unrelated to its API is
// the norm, as kie.ai → tempfile.aiquickdraw.com already showed) was correct, and
// the cost of being one host short is the worst-shaped failure this system has: the
// provider bills, the clip exists, and the user gets a 500 with nothing to retry.
//
// Both hosts stay. `api.segmind.com` is where their v1 output endpoint lives and is
// what their own 404 body names; `images.segmind.com` is where the finished file
// actually comes from. Neither is speculative now — one is documented by the vendor,
// the other observed in production through the adapter's own `segmind.asset_host`
// log line, which exists for exactly this correction.
export const SEGMIND_ASSET_HOSTS = ['api.segmind.com', 'images.segmind.com'] as const

// Folded in ONLY when the provider is configured; the download surface stays closed
// by default, exactly like the hosts above.
function withSegmindHost(allowlist: string[], segmindApiKey: string | null): string[] {
  if (!segmindApiKey) return allowlist
  // De-duplicated per host rather than per list: an operator who has already named
  // one of these in ASSET_HOST_ALLOWLIST must not lose the other.
  return SEGMIND_ASSET_HOSTS.reduce<string[]>(
    (acc, host) => (acc.includes(host) ? acc : [...acc, host]),
    allowlist,
  )
}

// Folded in ONLY when the provider is configured; the download surface stays closed
// by default, exactly like the four hosts above.
function withKieHost(allowlist: string[], kieApiKey: string | null): string[] {
  if (!kieApiKey) return allowlist
  return allowlist.includes(KIE_ASSET_HOST) ? allowlist : [...allowlist, KIE_ASSET_HOST]
}
