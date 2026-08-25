// Library entry point — what OTHER packages import when they embed this server.
//
// Deliberately NOT index.ts: that file is the stdio executable and calls main()
// at module scope, so importing it would boot a stdio server inside whatever
// process did the importing. The two entry points are the same code with
// different lifecycles, and keeping them separate is what lets the API mount the
// server (ADR mcp-server §P2.4) without inheriting a process-owning side effect.
export { ApiClient, ApiError } from './api-client'
export type { FetchLike, HttpMethod, PollOptions, RestClient } from './api-client'
export { loadConfig } from './config'
export type { McpConfig } from './config'
export { buildQuery, extractBody, isProcessing, toInputSchema } from './registry'
export type { PollSpec, ToolDef } from './registry'
export { buildServer, dispatch } from './server'
export type { ToolResult } from './server'
export { tools } from './tools'
