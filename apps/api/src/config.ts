// Typed env parsing (plan Task 3). Env vars are validated with Zod at boot so a
// misconfigured deployment fails fast, then mapped to a camelCase AppConfig that
// the rest of the app consumes — no process.env access outside this file.
// Ops hardening: loadEnvFromFile() wraps Node 22's native process.loadEnvFile
// so `pnpm dev` / `db:migrate` pick up the repo-root .env without sourcing.
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { z } from 'zod'

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
  }
}
