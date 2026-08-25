// The REMOTE MCP endpoint (ADR mcp-server §P2). This is what a Claude user
// connects to with a URL and a browser login instead of a password in a config
// file — the whole reason Phase 2 exists.
//
// Everything protocol-shaped is the SDK's; everything auth-shaped is
// better-auth's. What lives here is only the wiring between them and Fastify:
//
//   1. reject anything without a live MCP access token, the way the spec says to
//      (401 + a WWW-Authenticate pointing at our metadata, which is how a client
//      discovers where to go and log in);
//   2. build a per-request MCP server whose ApiClient can only act as the user
//      that token belongs to;
//   3. hand the raw req/res to the SDK transport.
//
// STATELESS on purpose: one Server + one transport per request, no session map.
// The API runs a single replica on a SQLite file today, but a stateful transport
// would silently break the moment it did not — and there is nothing to keep
// between calls, since every tool call is a complete REST request anyway.
import type { FastifyInstance } from 'fastify'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { buildServer } from '@opencreate/mcp'
import type { Auth } from '../auth/auth'
import { InProcessClient } from './inprocess-client'

export type McpDeps = {
  auth: Auth
  // Public origin of THIS deployment — the `resource` a client is being asked to
  // authenticate for, and the base of the metadata URL in the challenge.
  publicOrigin: string
}

export function registerMcpRoutes(app: FastifyInstance, deps: McpDeps) {
  // Discovery. A client hits this FIRST, unauthenticated, to learn which
  // authorization server guards this resource. It must therefore be public, and
  // it leaks nothing — the same two URLs are in every client's config.
  app.get('/.well-known/oauth-protected-resource', async () => ({
    resource: deps.publicOrigin,
    authorization_servers: [deps.publicOrigin],
    scopes_supported: ['openid', 'profile', 'email'],
    bearer_methods_supported: ['header'],
  }))

  // better-auth serves the authorization-server metadata under its own basePath;
  // the spec looks for it at the ROOT well-known path, so this forwards rather
  // than duplicating a document that would then be free to drift.
  app.get('/.well-known/oauth-authorization-server', async (req, reply) => {
    const res = await deps.auth.handler(
      new Request(`${deps.publicOrigin}/api/auth/.well-known/oauth-authorization-server`, {
        headers: { accept: 'application/json' },
      }),
    )
    reply.status(res.status).header('content-type', 'application/json')
    return reply.send(await res.text())
  })

  app.post('/mcp', async (req, reply) => {
    const authorization = req.headers.authorization
    if (!authorization?.startsWith('Bearer ')) {
      return unauthorized(reply, deps.publicOrigin, 'A bearer token is required.')
    }

    // The ONE authorization decision in this file. Everything downstream acts as
    // this user and cannot widen its own scope: the client below holds the
    // caller's token and nothing else, so a tool cannot reach another account
    // even if the tool table were wrong.
    const token = await resolveToken(deps.auth, authorization)
    if (!token) {
      return unauthorized(reply, deps.publicOrigin, 'The bearer token is invalid or expired.')
    }

    const server = buildServer(new InProcessClient(app, authorization))
    const transport = new StreamableHTTPServerTransport({
      // Stateless mode. The SDK selects it when sessionIdGenerator is undefined,
      // and the key is OMITTED rather than set to undefined because this repo
      // runs exactOptionalPropertyTypes — an explicit `undefined` is a type error
      // where an absent key is not. Same runtime value, and the SDK's own
      // stateless example is the explicit form only because it does not.
      // Plain JSON responses rather than an SSE stream. Our tools are
      // request/response — none of them streams partial output — and a JSON body
      // survives every proxy between here and the client, which an open SSE
      // stream on a managed platform does not reliably do.
      enableJsonResponse: true,
    })

    // Fastify must stop managing this response: from here the SDK owns the
    // socket, and a double-send would corrupt the JSON-RPC frame.
    reply.hijack()
    try {
      // Cast: the SDK's Transport interface declares its optional members as
      // `prop?: T` while this repo compiles with exactOptionalPropertyTypes, so
      // the two are structurally incompatible at the type level and identical at
      // runtime. Narrow and local — the alternative is relaxing the flag for the
      // whole package to accommodate one dependency's declarations.
      await server.connect(transport as unknown as Parameters<typeof server.connect>[0])
      // req.body is passed explicitly because Fastify has ALREADY consumed and
      // parsed the stream — the transport would otherwise read an empty request.
      await transport.handleRequest(req.raw, reply.raw, req.body)
    } catch (err) {
      req.log.error({ err, event: 'mcp.request_failed' }, 'MCP request failed')
      if (!reply.raw.headersSent) {
        reply.raw.writeHead(500, { 'content-type': 'application/json' })
        reply.raw.end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal error' },
            id: null,
          }),
        )
      }
    } finally {
      // One transport per request, so it is closed with the request. Leaving it
      // open is how a stateless endpoint quietly becomes a memory leak.
      await transport.close().catch(() => {})
    }
  })

  // GET and DELETE are the SSE/session half of Streamable HTTP. This endpoint is
  // stateless and JSON-only, so they are answered honestly rather than left to
  // 404 as if the endpoint did not exist.
  const notSupported = async (_req: unknown, reply: { status: (n: number) => { send: (b: unknown) => unknown } }) =>
    reply.status(405).send({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'This MCP endpoint is stateless: use POST.' },
      id: null,
    })
  app.get('/mcp', notSupported)
  app.delete('/mcp', notSupported)
}

async function resolveToken(auth: Auth, authorization: string) {
  try {
    return await auth.api.getMcpSession({ headers: new Headers({ authorization }) })
  } catch {
    return null
  }
}

// The 401 the MCP spec expects: the WWW-Authenticate header is how a client
// learns WHERE to authenticate. Without it Claude cannot start the login flow and
// the user just sees a failed connection with nothing to click.
function unauthorized(
  reply: {
    status: (n: number) => {
      header: (k: string, v: string) => { send: (b: unknown) => unknown }
    }
  },
  origin: string,
  message: string,
) {
  return reply
    .status(401)
    .header(
      'WWW-Authenticate',
      `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
    )
    .send({ jsonrpc: '2.0', error: { code: -32001, message }, id: null })
}
