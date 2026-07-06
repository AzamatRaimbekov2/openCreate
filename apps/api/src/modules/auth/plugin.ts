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
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { Auth } from './auth'

export type SessionUser = { id: string; email: string; name: string | null }

// Type-level registration of the decorator so routes get a typed requireUser
// without casts (fastify's declaration-merging pattern).
declare module 'fastify' {
  interface FastifyInstance {
    requireUser: (req: FastifyRequest) => Promise<SessionUser>
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

export async function registerAuth(app: FastifyInstance, auth: Auth) {
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    handler: async (req, reply) => {
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
    },
  })

  app.decorate('requireUser', async (req: FastifyRequest): Promise<SessionUser> => {
    // Only the cookie matters for session lookup — forward it verbatim.
    const headers = new Headers()
    if (req.headers.cookie) headers.set('cookie', req.headers.cookie)
    const session = await auth.api.getSession({ headers })
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
}
