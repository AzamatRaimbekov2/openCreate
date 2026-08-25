// The remote MCP endpoint's authorization and discovery (ADR mcp-server §P2).
//
// This endpoint is a second front door into every route in the product, opened
// by a token instead of a cookie. So the tests that matter are not "does a tool
// work" — the tool table is covered in packages/mcp — but:
//
//   · nothing gets in without a live token, and
//   · a refused caller is told WHERE to authenticate, because a 401 with no
//     WWW-Authenticate leaves Claude with nothing to click and the user with a
//     connection that just fails.
import { describe, expect, it } from 'vitest'
import { createDb } from '../src/db/client'
import { oauthAccessToken, oauthApplication } from '../src/db/schema'
import { buildTestApp } from './helpers/build-test-app'

type App = Awaited<ReturnType<typeof buildTestApp>>

const rpc = (app: App, headers: Record<string, string> = {}) =>
  app.inject({
    method: 'POST',
    url: '/mcp',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
    payload: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
  })

describe('remote MCP — authorization', () => {
  it('refuses an unauthenticated call with 401', async () => {
    const app = await buildTestApp({})
    expect((await rpc(app)).statusCode).toBe(401)
  })

  it('points a refused caller at the resource metadata, so the client can start a login', async () => {
    // Without this header Claude cannot discover the authorization server, and
    // the user sees a failed connection with no way forward. It is the one part
    // of the 401 that does actual work.
    const app = await buildTestApp({})
    const res = await rpc(app)
    const challenge = String(res.headers['www-authenticate'])
    expect(challenge).toContain('Bearer')
    expect(challenge).toContain('/.well-known/oauth-protected-resource')
  })

  it('refuses a bearer token that was never issued', async () => {
    // A forged or expired token must be rejected the same way as none at all —
    // never accepted, and never surfaced as a 500 that hides which it was.
    const app = await buildTestApp({})
    const res = await rpc(app, { authorization: 'Bearer not-a-real-token' })
    expect(res.statusCode).toBe(401)
  })

  it('refuses a non-Bearer Authorization header', async () => {
    const app = await buildTestApp({})
    expect((await rpc(app, { authorization: 'Basic dXNlcjpwYXNz' })).statusCode).toBe(401)
  })

  it('answers GET and DELETE honestly instead of 404-ing', async () => {
    // This endpoint is stateless, so the SSE/session half of Streamable HTTP does
    // not exist here. Saying so beats a 404, which reads as "wrong URL" and sends
    // someone debugging their config instead of their transport.
    const app = await buildTestApp({})
    expect((await app.inject({ method: 'GET', url: '/mcp' })).statusCode).toBe(405)
    expect((await app.inject({ method: 'DELETE', url: '/mcp' })).statusCode).toBe(405)
  })
})

describe('remote MCP — discovery', () => {
  it('serves protected-resource metadata WITHOUT a session', async () => {
    // A client reads this before it has any credential at all. If it required
    // one, discovery could never happen and the connect flow could never start.
    const app = await buildTestApp({})
    const res = await app.inject({ method: 'GET', url: '/.well-known/oauth-protected-resource' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.resource).toMatch(/^https?:\/\//)
    expect(body.authorization_servers).toHaveLength(1)
    expect(body.bearer_methods_supported).toContain('header')
  })

  it('serves authorization-server metadata at the ROOT well-known path', async () => {
    // better-auth publishes it under /api/auth/...; the spec looks for it at the
    // root. This route forwards rather than restating the document, so the two
    // cannot drift apart as the plugin's capabilities change.
    const app = await buildTestApp({})
    const res = await app.inject({ method: 'GET', url: '/.well-known/oauth-authorization-server' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.authorization_endpoint).toBeTruthy()
    expect(body.token_endpoint).toBeTruthy()
    // PKCE is required for a desktop client that cannot hold a secret (§P2.2).
    expect(body.code_challenge_methods_supported).toContain('S256')
  })

  it('advertises dynamic client registration, so no client allowlist is maintained', async () => {
    // Claude registers ITSELF on first connect. Without this, every user would
    // need us to add their client by hand before they could connect at all.
    const app = await buildTestApp({})
    const body = (
      await app.inject({ method: 'GET', url: '/.well-known/oauth-authorization-server' })
    ).json()
    expect(body.registration_endpoint).toBeTruthy()
  })
})

// ─── The authenticated path, end to end ──────────────────────────────────────
// Everything above proves the door is shut. This proves it OPENS for the right
// key, and that what comes through it is the real product: a live token →
// getMcpSession → requireUser → the in-process client → an actual REST route →
// a JSON-RPC result. Every link in that chain is new in Phase 2, and a test that
// only ever sees 401s would pass with the whole thing unwired.
//
// The token row is written directly because minting one the real way needs a
// browser to complete the authorization code flow. The row IS the contract —
// it is exactly what that flow persists.
describe('remote MCP — the authenticated path', () => {
  async function connected() {
    const db = createDb(':memory:').db
    const app = await buildTestApp({ db })
    const signUp = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: 'mcp@example.com', password: 'a-long-enough-passphrase-02', name: 'MCP' },
    })
    expect(signUp.statusCode).toBe(200)
    const userId = signUp.json().user.id as string
    const now = new Date()
    const hour = new Date(now.getTime() + 3_600_000)
    db.insert(oauthApplication)
      .values({
        id: 'app-1',
        name: 'Claude',
        clientId: 'client-1',
        redirectUrls: 'https://claude.ai/callback',
        type: 'public',
        createdAt: now,
        updatedAt: now,
      })
      .run()
    db.insert(oauthAccessToken)
      .values({
        id: 'tok-1',
        accessToken: 'live-access-token',
        refreshToken: 'live-refresh-token',
        accessTokenExpiresAt: hour,
        refreshTokenExpiresAt: hour,
        clientId: 'client-1',
        userId,
        scopes: 'openid profile email',
        createdAt: now,
        updatedAt: now,
      })
      .run()
    return { app, db, userId }
  }

  const call = (app: App, token: string, method: string, params: Record<string, unknown> = {}) =>
    app.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${token}`,
      },
      payload: { jsonrpc: '2.0', id: 1, method, params },
    })

  it('lists the consolidated tool table for a live token', async () => {
    const { app } = await connected()
    const res = await call(app, 'live-access-token', 'tools/list')
    expect(res.statusCode).toBe(200)
    const tools = res.json().result.tools as { name: string }[]
    // 16 action tools, not 43 endpoint tools (ADR §P2.5).
    expect(tools.length).toBeLessThanOrEqual(16)
    expect(tools.map((t) => t.name)).toContain('templates')
  })

  it('runs a tool AS THE TOKEN’S USER, through the real route', async () => {
    // The whole chain in one assertion: the account tool reads /api/me, which is
    // requireUser-gated, and comes back with this user's own email. If any link
    // were unwired this is where it shows.
    const { app } = await connected()
    const res = await call(app, 'live-access-token', 'tools/call', {
      name: 'account',
      arguments: { action: 'me' },
    })
    expect(res.statusCode).toBe(200)
    const text = res.json().result.content[0].text as string
    expect(text).toContain('mcp@example.com')
  })

  it('refuses an EXPIRED token even though the row exists', async () => {
    // Expiry is the only thing standing between a leaked token and permanent
    // access, so it is asserted rather than assumed from the library.
    const { app, db, userId } = await connected()
    const past = new Date(Date.now() - 60_000)
    db.insert(oauthAccessToken)
      .values({
        id: 'tok-2',
        accessToken: 'expired-token',
        refreshToken: 'expired-refresh',
        accessTokenExpiresAt: past,
        refreshTokenExpiresAt: past,
        clientId: 'client-1',
        userId,
        scopes: 'openid',
        createdAt: past,
        updatedAt: past,
      })
      .run()
    expect((await call(app, 'expired-token', 'tools/list')).statusCode).toBe(401)
  })
})
