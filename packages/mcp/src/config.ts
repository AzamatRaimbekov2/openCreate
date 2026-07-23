// Runtime config for the MCP server, read from the env block of the MCP client
// config (Claude Desktop / Claude Code `.mcp.json`). Credentials live there, not
// in code — the standard pattern for local stdio servers (see ADR mcp-server).
//
// NOTE: this is a stdio server — stdout is the MCP wire. Any diagnostics MUST go
// to stderr (console.error), never console.log.

export type McpConfig = {
  baseUrl: string
  email: string
  password: string
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
  // Trailing slash trimmed so `${baseUrl}${path}` never doubles the slash.
  const baseUrl = (env.OPENCREATE_BASE_URL ?? 'http://localhost:8787').replace(/\/+$/, '')
  const email = env.OPENCREATE_EMAIL ?? ''
  const password = env.OPENCREATE_PASSWORD ?? ''
  return { baseUrl, email, password }
}
