// better-auth instance factory (plan Task 5). Email+password always on; Google
// only when both env creds are configured. The drizzle adapter gets our schema
// EXPLICITLY (user/session/account/verification) so it maps to our tables instead
// of trying to infer them. The signup bonus is granted in the user.create.after
// database hook — it fires for BOTH email and social sign-ups, exactly once.
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import type { Db } from '../../db/client'
import type { AppConfig } from '../../config'
import { account, session, user, verification } from '../../db/schema'
import { grantSignupBonus, type MoneyLog } from '../credits/ledger'

// `log` (the base app logger): the signup bonus is a money-path event and must
// leave a structured ledger log line; the database hook has no request
// context, so the app-level logger is the best correlation we can offer here.
export function createAuth(db: Db, config: AppConfig, log?: MoneyLog) {
  return betterAuth({
    secret: config.betterAuthSecret,
    baseURL: config.betterAuthUrl,
    basePath: '/api/auth',
    trustedOrigins: [config.webOrigin],
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: { user, session, account, verification },
    }),
    emailAndPassword: { enabled: true },
    socialProviders:
      config.googleClientId && config.googleClientSecret
        ? { google: { clientId: config.googleClientId, clientSecret: config.googleClientSecret } }
        : {},
    user: {
      // creditsBalance lives on better-auth's user table; input:false forbids
      // clients from setting it at signup — only the ledger mutates it.
      additionalFields: {
        creditsBalance: { type: 'number', defaultValue: 0, input: false },
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (u) => {
            grantSignupBonus(db, u.id, config.signupBonusCredits, log)
          },
        },
      },
    },
  })
}
export type Auth = ReturnType<typeof createAuth>
