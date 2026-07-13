// apps/web/src/shared/libs/apiClient.ts
// Typed fetch wrapper for our own API. Every module talks to /api/* through
// api<T>() so the error envelope ({ error: { code, message } }, contracts
// apiErrorSchema) is decoded in exactly one place and surfaces as ApiClientError.
import { apiErrorSchema, type ApiErrorCode } from '@opencreate/contracts'

// Thrown for every non-2xx API response — carries the machine-readable code so
// callers can branch (e.g. insufficient_credits → pricing link, unauthorized → hide)
export class ApiClientError extends Error {
  // Error code from the envelope (contracts apiErrorCodeSchema)
  readonly code: ApiErrorCode
  // HTTP status of the failed response
  readonly status: number

  constructor(code: ApiErrorCode, message: string, status: number) {
    super(message)
    this.name = 'ApiClientError'
    this.code = code
    this.status = status
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  // Only DECLARE a JSON body when we actually send one. Setting Content-Type
  // unconditionally made every bodyless POST (e.g. POST /films/:id/renders)
  // arrive at Fastify as "application/json with an empty body", which its JSON
  // parser rejects with a 400 — the CinemaStudio export button never worked.
  // A GET/DELETE needs no request content type at all, so this is not a
  // special case for renders: it is the header being honest about the payload.
  const hasBody = init?.body !== undefined && init.body !== null
  const headers: HeadersInit = {
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    // Spread last so an explicit caller-supplied type (or a deliberate override)
    // still wins — e.g. a non-JSON upload.
    ...init?.headers,
  }

  const res = await fetch(path, {
    // Session cookie must always travel with API calls
    credentials: 'include',
    ...init,
    headers,
  })
  // 204 = intentionally empty (e.g. DELETE) — nothing to parse
  if (res.status === 204) return undefined as T
  // Body may be non-JSON (proxy error pages) — treat as "no envelope", not a crash
  const body: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(body)
    if (parsed.success) {
      throw new ApiClientError(parsed.data.error.code, parsed.data.error.message, res.status)
    }
    throw new ApiClientError('internal_error', `Request failed (${res.status})`, res.status)
  }
  // Trust boundary: the API is ours and typed by @opencreate/contracts — the
  // cast keeps call sites typed without re-validating every response
  return body as T
}
