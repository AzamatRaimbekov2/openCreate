# apiClient.ts — AI component doc

> AI-facing sidecar for `apiClient.ts`. Created 2026-07-06. Keep this in sync with the code on every change.

## Purpose

Single typed fetch wrapper for the app's own API (`/api/*`). Decodes the shared error
envelope in one place so every module gets a machine-readable `ApiClientError`.

## What it does (for an AI reader)

- Responsibilities: perform fetch with session cookies; parse 2xx JSON; map non-2xx to
  `ApiClientError` from the contracts envelope (fallback `internal_error`).
- **Content-Type is set ONLY when a body is actually sent.** Declaring
  `application/json` on a bodyless request makes Fastify reject it outright —
  "Body cannot be empty when content-type is set to 'application/json'" (400).
  That silently killed every bodyless POST, notably `POST /films/:id/renders`
  (the CinemaStudio export button never worked). A caller-supplied header still
  wins, so non-JSON payloads are unaffected.
- Public API / exports: `api<T>(path, init?): Promise<T>`, `class ApiClientError extends Error { code: ApiErrorCode; status: number }`.
- Inputs → Outputs: path + optional RequestInit → parsed `T`; 204 → `undefined`; non-2xx → throws `ApiClientError`.
- Side effects (I/O, network, state): network request via global `fetch`; no state.

## Dependencies

- Imports / depends on: `@opencreate/contracts` (`apiErrorSchema`, `ApiErrorCode`).
- Used by: `modules/Auth/model/useSession.ts` (useMe), `modules/Credits/model/creditsApi.ts`, later Generator/Gallery APIs.

## Diagram

```mermaid
flowchart LR
  M[module query/mutation] --> A[api&lt;T&gt;]
  A -->|fetch credentials:include| API[/api/*]
  API -->|2xx JSON| T[typed T]
  API -->|non-2xx envelope| E[ApiClientError code/message/status]
  API -->|204| U[undefined]
```

## Key decisions / gotchas

- Headers are merged AFTER `...init` so a caller-provided init cannot drop `Content-Type`
  (the plan snippet had the spread order inverted — that was a silent bug).
- Non-JSON error bodies (proxy HTML pages) resolve to `null` and fall back to
  `internal_error` instead of crashing on `res.json()`.
- The 2xx body is cast to `T` (trust boundary: our own API is typed by contracts);
  responses are not re-validated client-side.

## Update 2026-07-21 — `ApiClientError.detail`

`ApiClientError` gained a 4th constructor argument, `detail: ApiErrorDetail`
(`{reason?, subjectKind?, subjectId?}`), defaulting to `{}`.

**It must stay optional.** A required 4th argument would break every existing construction —
`apiClient` itself plus a dozen test call sites across Cinema, Gallery, Assets3D and
Generator — and most failures have no subject to point at.

`reason` is a loose `string` here on purpose: this layer is domain-agnostic. The owning
module narrows it against its own enum (`renderBlockCopy.ts` does this for Cinema), so an
unrecognized future reason degrades to generic copy instead of throwing.

The decode only sets keys that actually arrived, so an envelope without domain detail yields
an empty object rather than a bag of `undefined`s.

## Commits

- 1ecb2f7 2026-07-06 feat(web): api client + auth module (email/password, optional google)
