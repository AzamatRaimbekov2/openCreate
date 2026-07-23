---
type: decision
status: accepted
updated: 2026-07-22
sources:
  - build-mcp-server skill (mcp-server-dev@claude-plugins-official) — Anthropic official MCP guidance
  - apps/api/src/modules/* — REST surface being wrapped
  - apps/api/src/modules/auth/plugin.ts — better-auth cookie session, requireUser decorator
  - packages/contracts/src — shared zod schemas reused for tool inputs
tags:
  - project-docs
  - wiki/decision
  - architecture
  - mcp
  - integration
---

# ADR: `@opencreate/mcp` — MCP server wrapping the openCreate REST API

## Status

**Accepted — 2026-07-22** (owner decisions taken interactively during design).

Scope decisions already locked by the owner:

- **Purpose:** product-facing — expose openCreate's capabilities to Claude so a
  user can create content and whole film "projects" from Claude Desktop/Code
  (the Higgsfield-MCP analogue), NOT a dev-tooling server for building the repo.
- **Transport:** **local stdio now → remote HTTP + OAuth in Phase 2.** The core
  (ApiClient + tool registry) is built transport-agnostic so the "Connect
  button like Higgsfield" (which requires remote HTTP) is an additive Phase 2,
  not a rewrite.
- **Tool surface:** **all ~35 endpoints as one-tool-per-action.** The
  build-mcp-server skill flags that >~15 tools floods the context window and
  recommends search+execute; the owner was told and chose full one-per-action
  for explicitness. Revisit if context bloat shows up in practice.
- **Auth:** email+password from env → `POST /api/auth/sign-in/email` → session
  cookie held in memory → single re-login + retry on 401. **Zero backend
  changes.**
- **Framework:** official `@modelcontextprotocol/sdk` (TypeScript) — matches the
  all-TS monorepo and reuses `@opencreate/contracts` zod schemas.

## Context

openCreate is a generative-media platform (Fastify API on :8787 serving a Vite
SPA, single origin). It already exposes a full REST surface under `/api/*`:
films/cinema, generations (image/video), 3D assets, entities/portraits,
templates, catalog, credits, prompt-enhance. Auth is **session-cookie only**
(better-auth); there is no bearer/API-key mechanism. Every route calls
`app.requireUser(req)` and scopes queries by the caller's id.

The owner wants "connect from Claude and make a project" — the same experience
Higgsfield ships via its hosted MCP. Higgsfield's Connect-button/OAuth works
because it is a **remote HTTP** connector; a local stdio server cannot offer
that flow and instead takes credentials from its `env` block (the GitHub-MCP /
Postgres-MCP pattern).

## Decision

Build a new workspace package `packages/mcp` (`@opencreate/mcp`) that is a thin
MCP wrapper over the REST API:

1. **`ApiClient`** — the only component that knows about auth and `fetch`.
   Lazily signs in with `OPENCREATE_EMAIL`/`OPENCREATE_PASSWORD` against
   `/api/auth/sign-in/email`, caches the session cookie in memory, and on a 401
   re-logs-in once and retries. Maps the API's `{ error: { code, message, … } }`
   envelope to a readable MCP error.
2. **Tool registry** — a declarative `{ name, description, zodInput (from
   contracts), method, pathBuilder, responseShape }` list, registered on an
   `McpServer`. Reuses `@opencreate/contracts` schemas so client/server inputs
   can never drift.
3. **Entry point** (`bin: opencreate-mcp`) — boots `McpServer` +
   `StdioServerTransport`. Transport is the only Phase-2 swap point.

### Async generations

Video/render return `202 processing` and require polling; image returns `201`.
Submit tools (`generate_video`, `generate_shot_clip`, `render_film`) take a
`wait` flag (default true): the server polls to completion with a timeout
(~120s video / ~300s render) and returns the finished asset, else `{ id, status:
"processing" }` plus a hint to call `get_generation`/`get_render`. Image tools
also return an image content block (base64) for inline preview.

## Consequences

- **Positive:** works in the owner's Claude today with zero hosting and zero
  backend change; shared contracts kill input drift; transport-agnostic core
  keeps the remote/OAuth upgrade cheap.
- **Negative / risks:** ~35 tools is above the skill's recommended ceiling —
  accepted with eyes open, revisit if it degrades model performance. Env
  credentials are a plaintext secret in the MCP config (acceptable for a
  personal/local prototype; OAuth in Phase 2 removes it). Long-poll waits can
  hit MCP client timeouts — mitigated by the `wait` timeout + separate pollers.

## Out of scope (Phase 2+)

- Remote HTTP transport + OAuth 2.1 (CIMD/DCR) "Connect button" — the true
  Higgsfield parity.
- MCP resources (gallery/films as browsable resources) and prompts (slash-command
  workflows).
- Multi-tenant hosting / directory submission.
