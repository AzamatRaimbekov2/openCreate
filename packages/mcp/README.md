# @opencreate/mcp

An MCP server that wraps the openCreate REST API so a **Claude** user (Claude
Code / Claude Desktop) can create content and whole film "projects" through
natural language — the Higgsfield-MCP analogue for openCreate.

Two ways to run it, same tool table:

| | Remote (recommended) | Local stdio |
| --- | --- | --- |
| **Connect with** | a URL + a browser login | a JSON config + your password |
| **Auth** | OAuth 2.1 + PKCE, tokens in our DB | email/password in the config's env |
| **Runs** | inside the deployed API (`POST /mcp`) | on your machine, calls the API |
| **For** | anyone using openCreate | developing on this repo |

- **Tools:** **16**, each fronting a family of endpoints through an `action`
  argument, each reusing the shared `@opencreate/contracts` zod schema so tool
  input never drifts from what the API validates. Not one-per-endpoint: ~60 tool
  descriptions would sit in the context of every request, used or not.

See the ADR: `docs/wiki/decisions/mcp-server.md` (Phase 2 is the second half).

## Remote — connect from Claude

Add openCreate as a custom connector with this URL:

```
https://opencreate-production.up.railway.app/mcp
```

Claude discovers the authorization server, registers itself, and opens a browser
for you to sign in **on openCreate's own domain**. No password ever enters a
config file. Revoking is deleting the token row — your password is unaffected.

## Local stdio — for developing on this repo

### Prerequisites

1. The openCreate API running and reachable (default `http://localhost:8787`).
   Its origin must be a trusted origin for better-auth — the single-origin
   `BETTER_AUTH_URL` is trusted by default, so localhost dev needs nothing extra.
2. An openCreate account (email + password).

## Environment

| Var | Required | Default | Notes |
| --- | --- | --- | --- |
| `OPENCREATE_BASE_URL` | no | `http://localhost:8787` | API origin the server calls. |
| `OPENCREATE_EMAIL` | **yes** | – | Account the tools act as. |
| `OPENCREATE_PASSWORD` | **yes** | – | Account password. |

## Use in Claude Code (this repo)

`.mcp.json` already declares the `opencreate` server. Provide credentials via
your shell environment (they are interpolated, never committed):

```bash
export OPENCREATE_EMAIL="you@example.com"
export OPENCREATE_PASSWORD="…"
# optional: export OPENCREATE_BASE_URL="https://your-deploy.example.com"
```

Then enable the server (it is `autoStart: false`) and the tools appear as
`mcp__opencreate__*`.

## Use in Claude Desktop

Add to `claude_desktop_config.json`:

```jsonc
{
  "mcpServers": {
    "opencreate": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/openCreate/packages/mcp/src/index.ts"],
      "env": {
        "OPENCREATE_BASE_URL": "http://localhost:8787",
        "OPENCREATE_EMAIL": "you@example.com",
        "OPENCREATE_PASSWORD": "…"
      }
    }
  }
}
```

## Tools (by group)

- **Meta:** `get_me`, `list_catalog`, `list_credit_transactions`
- **Generations:** `create_generation`, `list_generations`, `get_generation`, `delete_generation`
- **Films:** `list_films`, `get_film`, `create_film`, `update_film`, `delete_film`, `create_film_from_template`, `list_templates`
- **Shots:** `add_shot`, `update_shot`, `delete_shot`, `reorder_shots`, `generate_storyboard`, `generate_shot_clip`, `add_shot_reference`, `remove_shot_reference`
- **Audio/render:** `add_film_audio`, `delete_film_audio`, `render_film`, `get_render`
- **Entities:** `list_entities`, `get_entity`, `create_entity`, `update_entity`, `delete_entity`
- **3D:** `list_assets3d`, `get_asset3d`, `create_asset3d`, `update_asset3d`, `delete_asset3d`, `add_asset3d_part`, `update_asset3d_part`, `delete_asset3d_part`, `create_model_render`, `get_model_render`, `delete_model_render`
- **Prompt:** `enhance_prompt`

### Async jobs

`create_generation`, `generate_shot_clip`, `render_film`, and
`create_model_render` submit async jobs. By default they **wait** (poll to
completion) and return the finished asset. Pass `wait: false` to return
immediately with `{ id, status: "processing" }` and poll later with
`get_generation` / `get_render` / `get_model_render`.

## Develop

```bash
pnpm --filter @opencreate/mcp test        # unit + contract + in-memory MCP e2e
pnpm --filter @opencreate/mcp typecheck
pnpm --filter @opencreate/mcp dev          # run the stdio server
```

## Roadmap (Phase 2)

Remote streamable-HTTP transport + OAuth "Connect button" (true Higgsfield
parity), MCP resources (gallery/films as browsable context), directory
submission. Guided by the `build-mcp-server` skill
(`mcp-server-dev@claude-plugins-official`).
