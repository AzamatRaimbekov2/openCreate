// The RestClient the MOUNTED MCP server dispatches through (ADR mcp-server §P2.4).
//
// The remote MCP endpoint lives inside the very API whose routes its tools call.
// The naive option is to have it call itself over HTTP, which costs a real socket
// per tool call and — worse — walks through our own rate limiter, so a 20-row
// Shorts batch could 429 itself halfway.
//
// So this dispatches through `app.inject()` instead. The request still traverses
// the real router, the real guards, the real zod validation and the real error
// envelope; it simply never leaves the process. The tool table is byte-identical
// between this and the stdio client, which is the seam Phase 1 built for.
import type { FastifyInstance } from 'fastify'
import { ApiError, type HttpMethod, type PollOptions, type RestClient } from '@opencreate/mcp'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export class InProcessClient implements RestClient {
  constructor(
    private readonly app: FastifyInstance,
    // The caller's `Authorization: Bearer <mcp token>`, forwarded verbatim on
    // every injected request. This is what makes requireUser resolve the right
    // user (§P2.3) — the MCP server itself holds no credential and can only ever
    // act as whoever presented the token.
    private readonly authorization: string,
  ) {}

  async request<T = unknown>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
    const res = await this.app.inject({
      method,
      url: path,
      headers: {
        authorization: this.authorization,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
    })

    // 204 and an empty body are both "success, nothing to say" — a DELETE.
    const text = res.body
    const parsed: unknown = text ? safeJson(text) : null

    if (res.statusCode >= 400) {
      const envelope = parsed as { error?: { code?: string; message?: string } } | null
      throw new ApiError(
        res.statusCode,
        envelope?.error?.code ?? 'internal_error',
        envelope?.error?.message ?? `HTTP ${res.statusCode}`,
      )
    }
    return parsed as T
  }

  async pollUntil<T = unknown>(
    path: string,
    isDone: (result: T) => boolean,
    opts: PollOptions,
  ): Promise<T> {
    const deadline = Date.now() + opts.timeoutMs
    // One read before the first sleep: a job that finished between submit and
    // poll should return immediately rather than wait out an interval.
    for (;;) {
      const result = await this.request<T>('GET', path)
      if (isDone(result)) return result
      if (Date.now() + opts.intervalMs >= deadline) return result
      await sleep(opts.intervalMs)
    }
  }
}

// A non-JSON body from our own API would be a bug, but throwing a SyntaxError
// here would surface as an opaque transport failure instead of the actual status.
function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return { error: { code: 'internal_error', message: text.slice(0, 500) } }
  }
}
