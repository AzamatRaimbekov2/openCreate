// Fastify ⇄ better-auth bridge (plan Task 5). better-auth's handler speaks web
// Request/Response, Fastify speaks Node req/reply — this file translates between
// them and exposes `requireUser` for route-level authentication.
//
// Why a manual Request bridge instead of better-auth/node's toNodeHandler:
// Fastify has already consumed + parsed the JSON body by the time our handler
// runs, so the raw IncomingMessage stream toNodeHandler wants to read is empty
// (and light-my-request's mocked sockets in tests make that worse). Rebuilding a
// web Request from the parsed body is the approach better-auth documents for
// Fastify. Behavior contract = test/auth.test.ts.
import { eq } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Db } from '../../db/client'
import { user } from '../../db/schema'
import type { Auth } from './auth'

export type SessionUser = { id: string; email: string; name: string | null }

// Type-level registration of the decorator so routes get a typed requireUser
// without casts (fastify's declaration-merging pattern).
declare module 'fastify' {
  interface FastifyInstance {
    requireUser: (req: FastifyRequest) => Promise<SessionUser>
    requireSuperAdmin: (req: FastifyRequest) => Promise<SessionUser>
  }
}

function toWebRequest(req: FastifyRequest): Request {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`)
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.append(key, value)
    else if (Array.isArray(value)) for (const v of value) headers.append(key, v)
  }
  // Fastify already parsed the JSON body — re-serialize it for the web Request.
  // GET/HEAD must pass null (a body there is invalid per fetch spec).
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
  return new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? JSON.stringify(req.body ?? {}) : null,
  })
}

export async function registerAuth(app: FastifyInstance, auth: Auth, db: Db) {
  const handler = async (req: FastifyRequest, reply: FastifyReply) => {
    const response = await auth.handler(toWebRequest(req))
    reply.status(response.status)
    response.headers.forEach((value, key) => {
      const k = key.toLowerCase()
      // set-cookie must NOT go through forEach: undici folds multiple cookies
      // into one comma-joined string, which browsers mis-parse. getSetCookie()
      // below preserves them as separate headers. content-length is dropped so
      // Fastify recomputes it for the re-read body.
      if (k === 'set-cookie' || k === 'content-length') return
      reply.header(key, value)
    })
    const cookies = response.headers.getSetCookie()
    if (cookies.length > 0) reply.header('set-cookie', cookies)
    reply.send(response.body ? await response.text() : null)
  }

  // Two routes, two buckets. POST is the credential stuffing / signup-spam
  // surface — 10/min per IP is plenty for a human and a wall for scripts. GET
  // must NOT share that bucket: the SPA reads get-session on every route
  // change/focus and Google lands on GET /callback/google — one strict shared
  // bucket let session polling starve sign-in (and the OAuth callback) with
  // 429s. Reads carry no credentials, so the global 300/min is the right wall.
  app.route({
    method: ['POST'],
    url: '/api/auth/*',
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    handler,
  })
  app.route({ method: ['GET'], url: '/api/auth/*', handler })

  // Resolve an MCP OAuth access token to its user (ADR mcp-server §P2.3). Returns
  // null for anything that is not a live Bearer token, so the caller can fall
  // through to the ordinary unauthorized path.
  const mcpUser = async (req: FastifyRequest): Promise<SessionUser | null> => {
    const header = req.headers.authorization
    if (!header?.startsWith('Bearer ')) return null
    const headers = new Headers({ authorization: header })
    try {
      const token = await auth.api.getMcpSession({ headers })
      if (!token?.userId) return null
      // The token carries only a userId, so the profile comes from the row —
      // which also means a deleted user's live token stops working immediately.
      const row = db
        .select({ id: user.id, email: user.email, name: user.name })
        .from(user)
        .where(eq(user.id, token.userId))
        .get()
      return row ? { id: row.id, email: row.email, name: row.name } : null
    } catch {
      // A malformed or expired token is not an exception the request should
      // die on — it is simply not authenticated.
      return null
    }
  }

  app.decorate('requireUser', async (req: FastifyRequest): Promise<SessionUser> => {
    // Cookie FIRST, and the order is deliberate: a request that somehow carries
    // both is a browser request, and the browser's own session is the one whose
    // CSRF protections were designed for it.
    const headers = new Headers()
    if (req.headers.cookie) headers.set('cookie', req.headers.cookie)
    const session = await auth.api.getSession({ headers })
    if (!session) {
      // No cookie session — this may still be Claude calling with an MCP token.
      // Accepting it HERE, at the one seam every protected route already passes
      // through, is what makes all 50 routes work over MCP without 50 edits.
      const viaMcp = await mcpUser(req)
      if (viaMcp) return viaMcp
    }
    if (!session) {
      // Central error handler (app.ts) maps statusCode+apiCode to the ApiError
      // envelope, so throwing here yields { error: { code: 'unauthorized' } }.
      const err = new Error('Sign in required') as Error & { statusCode: number; apiCode: string }
      err.statusCode = 401
      err.apiCode = 'unauthorized'
      throw err
    }
    return { id: session.user.id, email: session.user.email, name: session.user.name ?? null }
  })

  // The role is read from the DATABASE on every admin request, never from a claim
  // carried in the session (ADR analytics §2). One indexed read by primary key,
  // and in exchange revoking an admin takes effect on their NEXT REQUEST rather
  // than whenever their session happens to expire. For the one role that can read
  // every user's spend and our provider invoices, a stale claim is not an
  // acceptable failure mode.
  //
  // 403 and not 404: the caller is authenticated, and pretending the route does
  // not exist would only hide it from the one person entitled to be told plainly
  // that they are not an admin.
  app.decorate('requireSuperAdmin', async (req: FastifyRequest): Promise<SessionUser> => {
    const sessionUser = await app.requireUser(req)
    const row = db.select({ role: user.role }).from(user).where(eq(user.id, sessionUser.id)).get()
    if (row?.role !== 'super_admin') {
      const err = new Error('Admin only') as Error & { statusCode: number; apiCode: string }
      err.statusCode = 403
      err.apiCode = 'forbidden'
      throw err
    }
    return sessionUser
  })
}
