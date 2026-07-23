#!/usr/bin/env -S npx tsx
// Entry point: boot the openCreate MCP server over stdio. This is the ONLY place
// that touches process env, the transport, and process lifecycle — everything
// testable lives in server.ts / api-client.ts / registry.ts.
//
// CRITICAL: stdout is the MCP wire. All diagnostics MUST go to stderr
// (console.error), never console.log — a stray stdout write corrupts the protocol.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ApiClient } from './api-client'
import { loadConfig } from './config'
import { buildServer } from './server'

async function main() {
  const config = loadConfig()

  // Warn (to stderr) if creds are absent — the server still starts and lists its
  // tools, but any call will fail with a clear "set OPENCREATE_EMAIL/PASSWORD".
  if (!config.email || !config.password) {
    console.error(
      '[opencreate-mcp] OPENCREATE_EMAIL / OPENCREATE_PASSWORD are not set — tool calls will fail until they are configured in the MCP server env.',
    )
  }
  console.error(`[opencreate-mcp] ready · base=${config.baseUrl}`)

  const client = new ApiClient(config)
  const server = buildServer(client)
  await server.connect(new StdioServerTransport())
}

main().catch((err) => {
  console.error('[opencreate-mcp] fatal:', err)
  process.exit(1)
})
