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
