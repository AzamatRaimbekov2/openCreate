# config.ts — AI component doc

> AI-facing sidecar for `config.ts`. Created 2026-07-22. Keep this in sync with the code on every change.

## Purpose
Loads the MCP server's runtime config (openCreate base URL + sign-in credentials) from the process env block that the MCP client (Claude Desktop / `.mcp.json`) injects.

## What it does (for an AI reader)
- Responsibilities: read `OPENCREATE_BASE_URL` / `OPENCREATE_EMAIL` / `OPENCREATE_PASSWORD`, normalize the base URL (strip trailing slash so path joins never double `//`).
- Public API / exports: `type McpConfig`, `loadConfig(env?) => McpConfig`.
- Inputs → Outputs: `process.env` → `{ baseUrl, email, password }`.
- Side effects: none (pure read). Missing creds are NOT thrown here — `ApiClient.login()` raises a readable error on first use.

## Dependencies
- Imports / depends on: nothing.
- Used by: `index.ts` (bootstrap), `api-client.ts` (via injected config).

## Diagram
```mermaid
flowchart LR
  ENV[process.env] --> loadConfig[loadConfig] --> CFG[McpConfig]
  CFG --> ApiClient
```

## Key decisions / gotchas
- stdio server: stdout is the MCP wire — diagnostics go to stderr only.
- Default base URL is `http://localhost:8787` (single-origin dev/prod API port).

## Commits
- _no commit yet_
