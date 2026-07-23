// apps/web/src/shared/libs/apiClient.ts
// Typed fetch wrapper for our own API. Every module talks to /api/* through
// api<T>() so the error envelope ({ error: { code, message } }, contracts
// apiErrorSchema) is decoded in exactly one place and surfaces as ApiClientError.
import { apiErrorSchema, type ApiErrorCode } from '@opencreate/contracts'

// Thrown for every non-2xx API response — carries the machine-readable code so
// callers can branch (e.g. insufficient_credits → pricing link, unauthorized → hide)
// Optional domain detail some failures carry (contracts apiErrorSchema). A code
// says what KIND of failure; these say what it was ABOUT — e.g. which shot is
// blocking an export. Kept as a loose string here on purpose: this layer is
// domain-agnostic, and the owning module narrows `reason` against its own enum so
// an unrecognized future value degrades to generic copy instead of throwing.
export type ApiErrorDetail = {
  reason?: string
  subjectKind?: 'shot' | 'audio' | 'film'
  subjectId?: string
}

// Thrown for every non-2xx API response — carries the machine-readable code so
// callers can branch (e.g. insufficient_credits → pricing link, unauthorized → hide)
export class ApiClientError extends Error {
  // Error code from the envelope (contracts apiErrorCodeSchema)
  readonly code: ApiErrorCode
  // HTTP status of the failed response
  readonly status: number
  // Domain detail, when the failure carries any. OPTIONAL — and it must stay
  // optional: a required 4th argument would break every existing construction
  // (apiClient itself plus a dozen test call sites), and most failures have no
  // subject to point at.
  readonly detail: ApiErrorDetail

  constructor(code: ApiErrorCode, message: string, status: number, detail: ApiErrorDetail = {}) {
    super(message)
    this.name = 'ApiClientError'
    this.code = code
    this.status = status
    this.detail = detail
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
      const { code, message, reason, subjectKind, subjectId } = parsed.data.error
      throw new ApiClientError(code, message, res.status, {
        // Only set what actually arrived — an envelope without domain detail
        // yields an empty object, not a bag of undefineds.
        ...(reason !== undefined ? { reason } : {}),
        ...(subjectKind !== undefined ? { subjectKind } : {}),
        ...(subjectId !== undefined ? { subjectId } : {}),
      })
    }
    throw new ApiClientError('internal_error', `Request failed (${res.status})`, res.status)
  }
  // Trust boundary: the API is ours and typed by @opencreate/contracts — the
  // cast keeps call sites typed without re-validating every response
  return body as T
}
