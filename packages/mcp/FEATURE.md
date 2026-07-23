# @opencreate/mcp — Feature doc

MCP server wrapping the openCreate REST API so a Claude user can create content
and whole film projects from Claude Code / Desktop. See `README.md`, the ADR
`docs/wiki/decisions/mcp-server.md`, and the spec
`docs/superpowers/specs/2026-07-22-opencreate-mcp-design.md`.

## Shape

- **Transport:** local stdio (`src/index.ts`, `#!/usr/bin/env -S npx tsx`).
- **Auth:** `ApiClient` signs in via `/api/auth/sign-in/email` with env
  credentials, caches the better-auth session cookie, re-logs-in+retries once on
  a 401. Sends `Origin: <baseUrl>` so the CSRF wall passes.
- **Tools:** declarative table (`src/tools.ts`) — one `ToolDef` per real REST
  endpoint (~43). Bodies reuse `@opencreate/contracts` zod schemas; JSON Schema
  for tools/list is derived via `z.toJSONSchema` (`src/registry.ts`).
- **Async:** submit tools (`create_generation`, `generate_shot_clip`,
  `render_film`, `create_model_render`) poll the 202 lifecycle to completion
  unless `wait:false`.

## Files

| File | Role |
| --- | --- |
| `src/config.ts` | Env → `{ baseUrl, email, password }`. |
| `src/api-client.ts` | The only `fetch`/auth seam; `request` + `pollUntil`; `ApiError`. |
| `src/registry.ts` | `ToolDef` model + pure helpers (query, body split, JSON Schema, poll detect). |
| `src/tools.ts` | The full tool table. |
| `src/server.ts` | `buildServer` (tools/list + tools/call) + testable `dispatch`. |
| `src/index.ts` | stdio bootstrap. |
| `test/*` | unit (ApiClient) · contract (dispatch) · in-memory MCP e2e. |

## Verification (2026-07-22)

- `pnpm --filter @opencreate/mcp typecheck` — clean.
- `pnpm --filter @opencreate/mcp test` — 20/20 (3 files).
- Live smoke against the running API (`:8787`): real login → `get_me`
  (balance 200), `list_films` (empty), `list_catalog` (16 models). CSRF/origin
  confirmed: server-side sign-in with `Origin: baseUrl` reaches credential
  validation (401 on bad creds, not an origin refusal).

## Not yet (Phase 2)

Remote HTTP + OAuth "Connect button", MCP resources/prompts, directory
submission.
