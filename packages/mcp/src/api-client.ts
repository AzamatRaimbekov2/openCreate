// The ONLY component that knows about auth and `fetch`. Everything else (the
// tool registry, the server) speaks to the openCreate REST API exclusively
// through this class. See ADR docs/wiki/decisions/mcp-server.md.
//
// Auth model: openCreate has no bearer/API-key — only better-auth session
// cookies. So we sign in with email+password (from env), capture the Set-Cookie
// the sign-in endpoint returns, and replay it as the `Cookie` header on every
// subsequent request. On a 401 (cookie expired/rotated) we re-login ONCE and
// retry — a single retry, never a loop, so a genuinely-bad credential fails fast
// instead of hammering the auth rate-limit bucket.
import type { McpConfig } from './config'

// The API's uniform error envelope is `{ error: { code, message, ... } }`
// (apps/api central handler). We surface it as a typed error so the server layer
// can turn it into a readable MCP tool error instead of a raw HTTP dump.
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

export type PollOptions = {
  timeoutMs: number
  intervalMs: number
}

// Injectable fetch so tests can drive the client with a mock and never touch the
// network. Defaults to the global (Node 22+ has undici fetch with getSetCookie).
export type FetchLike = typeof fetch

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export class ApiClient {
  private cookie: string | null = null

  constructor(
    private readonly cfg: McpConfig,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  // Sign in and cache the session cookie. Reduced to the `name=value` head of
  // each Set-Cookie (the part a client echoes back); attributes like Path/HttpOnly
  // are server-only and must not be sent back.
  private async login(): Promise<void> {
    if (!this.cfg.email || !this.cfg.password) {
      throw new ApiError(
        401,
        'unauthorized',
        'Missing credentials — set OPENCREATE_EMAIL and OPENCREATE_PASSWORD in the MCP server env.',
      )
    }
    const res = await this.fetchImpl(`${this.cfg.baseUrl}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // better-auth's CSRF wall validates Origin on state-changing auth calls.
        // A non-browser client has no Origin, so we send the API's own origin;
        // it must be in TRUSTED_ORIGINS (single-origin deploys already satisfy
        // this — see README).
        origin: this.cfg.baseUrl,
      },
      body: JSON.stringify({ email: this.cfg.email, password: this.cfg.password }),
    })
    if (!res.ok) {
      throw new ApiError(
        res.status,
        'unauthorized',
        'Sign-in failed — check OPENCREATE_EMAIL / OPENCREATE_PASSWORD (and that the base URL is in TRUSTED_ORIGINS).',
      )
    }
    const cookies = res.headers.getSetCookie?.() ?? []
    const jar = cookies.map((c) => c.split(';')[0]).filter(Boolean)
    if (jar.length === 0) {
      throw new ApiError(502, 'provider_error', 'Sign-in returned no session cookie.')
    }
    this.cookie = jar.join('; ')
  }

  // Core request. Lazily logs in, replays the cookie, maps the error envelope,
  // and retries exactly once on a 401 after a fresh login.
  async request<T = unknown>(
    method: HttpMethod,
    path: string,
    body?: unknown,
    retried = false,
  ): Promise<T> {
    if (!this.cookie) await this.login()

    // Build init conditionally: under exactOptionalPropertyTypes a literal
    // `body: undefined` is rejected, and GET/DELETE must carry no body at all.
    const init: RequestInit = {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(this.cookie ? { cookie: this.cookie } : {}),
        origin: this.cfg.baseUrl,
      },
    }
    if (body !== undefined) init.body = JSON.stringify(body)

    const res = await this.fetchImpl(`${this.cfg.baseUrl}${path}`, init)

    // Cookie went stale mid-session → one clean re-login + replay. `retried`
    // caps it at a single attempt so bad creds surface instead of looping.
    if (res.status === 401 && !retried) {
      this.cookie = null
      await this.login()
      return this.request<T>(method, path, body, true)
    }

    const text = await res.text()
    const json = text ? safeJsonParse(text) : null

    if (!res.ok) {
      const envelope = (json as { error?: { code?: string; message?: string } } | null)?.error
      throw new ApiError(
        res.status,
        envelope?.code ?? 'error',
        envelope?.message ?? `Request failed (HTTP ${res.status}).`,
      )
    }
    return json as T
  }

  // Poll a GET path until `isDone` or the timeout. Used to turn the API's async
  // 202 lifecycle (video/render/mesh) into a single synchronous MCP tool call.
  async pollUntil<T = unknown>(
    path: string,
    isDone: (result: T) => boolean,
    opts: PollOptions,
  ): Promise<T> {
    const deadline = Date.now() + opts.timeoutMs
    let last = await this.request<T>('GET', path)
    while (!isDone(last) && Date.now() < deadline) {
      await sleep(opts.intervalMs)
      last = await this.request<T>('GET', path)
    }
    return last
  }
}

// A non-JSON body from a successful response is unexpected but must not crash the
// tool — return null and let the caller pass it through.
function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
