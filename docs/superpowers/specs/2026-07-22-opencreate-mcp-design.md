# openCreate MCP server — design spec

**Date:** 2026-07-22
**Package:** `@opencreate/mcp` (`packages/mcp`)
**ADR:** `docs/wiki/decisions/mcp-server.md`
**Status:** approved for implementation (owner decisions locked interactively)

## Goal

Let a Claude user (Desktop/Code) connect to openCreate and create content and
whole film "projects" through natural language — the Higgsfield-MCP analogue,
built as a thin MCP wrapper over the existing REST API.

## Locked decisions

| Axis | Decision |
|---|---|
| Purpose | Product-facing (drive openCreate), not repo dev-tooling |
| Transport | Local **stdio** now; core transport-agnostic for remote+OAuth Phase 2 |
| Tool surface | All ~35 endpoints, **one tool per action** |
| Auth | email+password from env → `/api/auth/sign-in/email` → cookie in memory → 401 retry |
| Framework | Official `@modelcontextprotocol/sdk` (TS) |
| Contracts | Reuse `@opencreate/contracts` zod schemas for tool inputs |

## Architecture

```
Claude Desktop/Code
      │ MCP (stdio)
      ▼
@opencreate/mcp
  ├─ index.ts        McpServer + StdioServerTransport + register(registry)
  ├─ api-client.ts   sign-in, cookie cache, 401 retry, error-envelope mapping
  └─ tools/          declarative registry, one entry per action (reuses contracts)
      │ fetch (cookie)
      ▼
openCreate REST API :8787  (OPENCREATE_BASE_URL)
```

Three units, each one responsibility:

- **`ApiClient`** — only place that knows auth + `fetch`. Public methods:
  `get/post/patch/del(path, body?)` returning parsed JSON or throwing a mapped
  MCP error. Lazily logs in; caches `Set-Cookie`; on 401 re-logs-in once then
  retries; surfaces `{error:{code,message}}` as readable text.
- **Tool registry** — `defineTool({ name, title, description, input: zodShape,
  call: (client, args) => result })`. A factory keeps the ~35 entries tiny.
- **Entry point** — boots the server over stdio. Only swap point for Phase 2.

## Tool inventory (one per action)

- **Meta:** `get_me`, `list_catalog`, `list_credit_transactions`
- **Generations:** `generate_image`, `generate_video`, `get_generation`,
  `list_generations`, `delete_generation`
- **Films:** `list_films`, `get_film`, `create_film`, `update_film`,
  `delete_film`, `create_film_from_template`, `list_templates`
- **Shots:** `add_shot`, `update_shot`, `delete_shot`, `reorder_shots`,
  `generate_storyboard`, `generate_shot_clip`, `add_shot_reference`,
  `remove_shot_reference`
- **Audio/render:** `add_film_audio`, `delete_film_audio`, `render_film`,
  `get_render`
- **Entities:** `list_entities`, `get_entity`, `create_entity`, `update_entity`,
  `delete_entity`, `add_entity_image`, `create_portraits`
- **3D:** `list_assets3d`, `get_asset3d`, `create_asset3d`, `update_asset3d`,
  `delete_asset3d`, `add_asset3d_part`, `update_asset3d_part`,
  `delete_asset3d_part`, `create_model_render`, `get_model_render`
- **Prompt:** `enhance_prompt`

Each tool's input schema is imported from `@opencreate/contracts` (e.g.
`createFilmInputSchema`, `createGenerationInputSchema`) — no re-declaration.

## Async generations

Video/render are `202 processing`; image is `201`. Submit tools
(`generate_video`, `generate_shot_clip`, `render_film`) accept `wait` (default
true):

- `wait:true` → server polls `GET /api/generations/:id` (or `…/renders/:id`)
  until terminal or timeout (~120s video, ~300s render), returns the finished
  asset.
- timeout → `{ id, status: "processing" }` + hint to call the poller.
- image results also return an MCP image content block (base64) for inline preview.

`get_generation` / `get_render` remain available for manual polling.

## Errors

- Zod validation of tool input happens before any network call.
- `ApiClient` maps the API envelope: `validation_failed` → the message,
  `unauthorized` → "check OPENCREATE_EMAIL/PASSWORD", `provider_error` →
  provider-down text, `conflict` (render in progress) → "already running", etc.

## Package layout

```
packages/mcp/
  package.json          # @opencreate/mcp; bin opencreate-mcp; deps: sdk, contracts, zod
  tsconfig.json
  src/
    index.ts
    api-client.ts
    tools/
      index.ts          # registry + defineTool factory
      meta.ts generations.ts films.ts shots.ts entities.ts assets3d.ts prompt.ts
  test/
    api-client.test.ts  # login, cookie cache, 401 retry, envelope mapping (mock fetch)
    tools.test.ts       # each tool → expected method+path+body (mock ApiClient)
    e2e.test.ts         # create_film → storyboard → generate_shot_clip vs in-memory buildApp
```

Plus a `.mcp.json` entry for this repo (Claude Code) and a short Claude Desktop
config snippet in the package README.

## Test plan (behaviour)

Acceptance criteria:

1. With valid env creds, the server lists tools and `get_me` returns the
   profile + credit balance.
2. `generate_image` returns a finished asset (URL + image block) synchronously.
3. `generate_video` with `wait:true` polls and returns the finished URL (mocked
   provider in e2e); on timeout returns `{id,status:processing}`.
4. Full "make a project" flow: `create_film` → `generate_storyboard` →
   `generate_shot_clip` produces a shot with a clip.
5. A 401 mid-session triggers exactly one re-login + retry, then succeeds.
6. Zod-invalid input is rejected before any HTTP call.

Layers: unit (ApiClient), contract (per-tool method/path/body), e2e (in-memory
`buildApp` with mocked providers). Mutation-check the ApiClient tests.

## Phases

1. Package scaffold + `ApiClient` (login/cookie/401-retry/errors) + unit tests.
2. Meta + generations (`generate_image/video`, pollers, catalog, me).
3. Films + shots + storyboard + render (the full "make a project" path).
4. Entities + 3D + templates + prompt (finish "all of it").
5. `.mcp.json` + README + e2e from Claude, verify.

## Out of scope (Phase 2+)

Remote HTTP + OAuth Connect button; MCP resources/prompts; multi-tenant hosting;
directory submission.
