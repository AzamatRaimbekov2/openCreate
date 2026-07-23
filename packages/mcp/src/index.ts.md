# index.ts — AI component doc

> AI-facing sidecar for `index.ts`. Created 2026-07-22. Keep this in sync with the code on every change.

## Purpose
The executable entry point: load config from env, build the API client + MCP server, and connect it over stdio. The only place that touches process env, transport, and lifecycle.

## What it does (for an AI reader)
- Responsibilities: `loadConfig()` → warn-if-missing-creds (stderr) → `new ApiClient` → `buildServer` → `server.connect(StdioServerTransport)`; fatal errors exit non-zero.
- Public API / exports: none (a `main()` bootstrap; shebang `npx tsx`).
- Inputs → Outputs: `process.env` → a running MCP stdio server.
- Side effects: stdio transport, stderr logging, `process.exit` on fatal.

## Dependencies
- Imports / depends on: `@modelcontextprotocol/sdk/server/stdio.js`, `./api-client`, `./config`, `./server`.
- Used by: the MCP client (Claude Desktop / `.mcp.json`) as the launched command.

## Diagram
```mermaid
flowchart LR
  ENV[process.env] --> main
  main --> client[ApiClient] --> srv[buildServer]
  srv --> stdio[StdioServerTransport] --> Claude
```

## Key decisions / gotchas
- stdout is the MCP wire — ALL diagnostics go to stderr (`console.error`), never `console.log`.
- Missing creds only warn (server still lists tools); the first call fails with a clear message.
- Run via `tsx` (no build step) — matches the API's dev runner.

## Commits
- _no commit yet_
