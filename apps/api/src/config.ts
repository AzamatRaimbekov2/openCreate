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

// zod v4: z.url() is the non-deprecated replacement for z.string().url().
const envSchema = z.object({
  RUNWARE_API_KEY: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url().default('http://localhost:8787'),
  WEB_ORIGIN: z.url().default('http://localhost:5173'),
  API_PORT: z.coerce.number().default(8787),
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
  assetHostAllowlist: string[]
  // Fastify trustProxy value: false = never trust proxy headers (default),
  // true = trust X-Forwarded-For from any peer, string = fastify/proxy-addr
  // address/CIDR/keyword list of peers whose headers are trusted.
  trustProxy: boolean | string
}

// TRUST_PROXY env → fastify trustProxy. Default-deny: only an explicit opt-in
// makes the app read client identity from X-Forwarded-For. The tri-state keeps
// both deployment shapes safe: direct exposure ignores forgeable headers
// (unset/'false'), the documented reverse-proxy deploy sets 'true' or — better —
// restricts trust to the proxy's own address so even an appended inbound
// X-Forwarded-For chain resolves to the real client (proxy-addr walks from the
// socket peer and stops at the first untrusted hop).
function parseTrustProxy(raw: string | undefined): boolean | string {
  const value = raw?.trim() ?? ''
  if (value === '' || value.toLowerCase() === 'false') return false
  if (value.toLowerCase() === 'true') return true
  return value
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
  return {
    runwareApiKey: e.RUNWARE_API_KEY,
    betterAuthSecret: e.BETTER_AUTH_SECRET,
    betterAuthUrl: e.BETTER_AUTH_URL,
    webOrigin: e.WEB_ORIGIN,
    port: e.API_PORT,
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
    // provider's own domain unless the operator explicitly widens it.
    assetHostAllowlist: e.ASSET_HOST_ALLOWLIST.split(',')
      .map((h) => h.trim())
      .filter(Boolean),
    trustProxy: parseTrustProxy(e.TRUST_PROXY),
  }
}
