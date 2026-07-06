// Typed env parsing (plan Task 3). Env vars are validated with Zod at boot so a
// misconfigured deployment fails fast, then mapped to a camelCase AppConfig that
// the rest of the app consumes — no process.env access outside this file.
import { z } from 'zod'

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
})

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
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
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
  }
}
