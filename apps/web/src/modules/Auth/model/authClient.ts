// apps/web/src/modules/Auth/model/authClient.ts
// better-auth React client for the Auth module. Components import the auth
// actions from HERE (module-internal) — never from 'better-auth' directly —
// so the provider can be swapped/mocked in one place.
import { createAuthClient } from 'better-auth/react'

// No explicit baseURL: better-auth 1.6.x requires an absolute http(s) URL and
// throws on a relative '/api/auth'. With no option it resolves
// window.location.origin + default basePath '/api/auth' — same-origin, which is
// exactly right: the Vite dev server proxies /api to the Fastify API on :8787.
export const authClient = createAuthClient()

// Public auth surface used by components/routes (plan Task 14)
export const { signIn, signUp, signOut, useSession } = authClient
