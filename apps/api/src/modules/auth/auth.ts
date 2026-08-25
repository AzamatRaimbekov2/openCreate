// better-auth instance factory (plan Task 5). Email+password always on; Google
// only when both env creds are configured. The drizzle adapter gets our schema
// EXPLICITLY (user/session/account/verification) so it maps to our tables instead
// of trying to infer them. The signup bonus is granted in the user.create.after
// database hook — it fires for BOTH email and social sign-ups, exactly once.
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { mcp } from 'better-auth/plugins'
import type { Db } from '../../db/client'
import type { AppConfig } from '../../config'
import {
  account,
  oauthAccessToken,
  oauthApplication,
  oauthConsent,
  session,
  user,
  verification,
} from '../../db/schema'
import { grantSignupBonus, type MoneyLog } from '../credits/ledger'

// `log` (the base app logger): the signup bonus is a money-path event and must
// leave a structured ledger log line; the database hook has no request
// context, so the app-level logger is the best correlation we can offer here.
export function createAuth(db: Db, config: AppConfig, log?: MoneyLog) {
  return betterAuth({
    secret: config.betterAuthSecret,
    baseURL: config.betterAuthUrl,
    basePath: '/api/auth',
    // Allowlist for the CSRF origin check (and OAuth callback validation):
    // TRUSTED_ORIGINS env (comma list) or [WEB_ORIGIN]. In prod BETTER_AUTH_URL
    // must be the public https origin — cookies and callbacks derive from it.
    trustedOrigins: config.trustedOrigins,
    // better-auth silently sets skipOriginCheck=true under NODE_ENV=test
    // (isTest() default), which would leave the CSRF wall untested. Explicit
    // `false` = the documented production default, applied in EVERY env, so
    // test/trusted-origins.test.ts exercises the real prod behavior.
    advanced: { disableOriginCheck: false },
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: {
        user,
        session,
        account,
        verification,
        // The OAuth authorization server's three tables (ADR mcp-server §P2.2).
        // Explicit like the four above — the adapter maps by these keys, so an
        // omission reads as an empty table rather than an error.
        oauthApplication,
        oauthAccessToken,
        oauthConsent,
      },
    }),
    emailAndPassword: { enabled: true },
    socialProviders:
      config.googleClientId && config.googleClientSecret
        ? { google: { clientId: config.googleClientId, clientSecret: config.googleClientSecret } }
        : {},
    account: {
      // Google sign-in with the email of an existing password account must LINK,
      // not die on better-auth's error page with account_not_linked.
      accountLinking: {
        // Google verifies its emails — linking on a verified provider email is
        // the documented trusted-provider pattern.
        trustedProviders: ['google'],
        // This app has NO email-verification flow, so every password user stays
        // emailVerified=false forever — better-auth's default
        // requireLocalEmailVerified=true wall would refuse Google linking for
        // ALL of them. Accepted tradeoff (no email infra exists to verify
        // against): someone who pre-registers a password account on an email
        // they don't own could be linked to by that email's real Google owner.
        requireLocalEmailVerified: false,
      },
    },
    user: {
      // creditsBalance lives on better-auth's user table; input:false forbids
      // clients from setting it at signup — only the ledger mutates it.
      additionalFields: {
        creditsBalance: { type: 'number', defaultValue: 0, input: false },
        // 'user' | 'super_admin'. input:false is the security wall: a signup
        // payload can never name its own role. The only writer of
        // 'super_admin' is the dev-only seed (dev-admin.ts); declaring the
        // field here is what surfaces it on session/user objects so the SPA
        // and future admin gates can read it.
        role: { type: 'string', defaultValue: 'user', input: false },
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
    // The OAuth authorization server that lets Claude connect to this deployment
    // (ADR mcp-server §P2.2). It is a PLUGIN and not our own code on purpose:
    // this is an authorization server living beside the credit ledger, and the
    // spec details that are easy to get subtly wrong — PKCE, discovery metadata,
    // dynamic registration — are exactly the ones a maintained library tracks.
    plugins: [
      mcp({
        // OUR page, on OUR domain. The whole point of Phase 2 is that a user
        // types their password into openCreate and never into a config file.
        loginPage: '/login',
        oidcConfig: {
          // Repeated because OIDCOptions requires its own copy; the two must
          // agree, and both point at our page.
          loginPage: '/login',
          // Non-negotiable for a desktop client, which cannot hold a secret.
          requirePKCE: true,
          // Claude registers ITSELF on first connect (RFC 7591), so there is no
          // client allowlist for us to maintain and none for a user to copy.
          allowDynamicClientRegistration: true,
        },
      }),
    ],
  })
}
export type Auth = ReturnType<typeof createAuth>
