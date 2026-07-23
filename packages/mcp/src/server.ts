// Wires the declarative tool table onto an MCP Server: advertises every tool
// (tools/list) and dispatches calls (tools/call). Uses the SDK's LOW-LEVEL Server
// with hand-built JSON Schema rather than the high-level zod-shape helper, so the
// package is decoupled from whichever zod version the SDK bundles — our contract
// schemas (zod 4) are converted once via z.toJSONSchema and validated by us.
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { ApiError, type ApiClient } from './api-client'
import { buildQuery, extractBody, isProcessing, toInputSchema } from './registry'
import { tools } from './tools'

const toolByName = new Map(tools.map((t) => [t.name, t]))

export type ToolResult = {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

function ok(result: unknown): ToolResult {
  // A 204/no-body (DELETE) yields null — report a clean success rather than "null".
  const payload = result ?? { ok: true }
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] }
}

function fail(text: string): ToolResult {
  // isError:true surfaces the failure to Claude as a tool error (still a normal
  // protocol response, so the conversation continues) instead of a transport fault.
  return { content: [{ type: 'text', text }], isError: true }
}

function errorText(err: unknown): string {
  // Map the API's typed envelope to a readable, actionable line.
  if (err instanceof ApiError) return `[${err.code}] ${err.message}`
  return err instanceof Error ? err.message : String(err)
}

// The pure dispatch path, exported for tests (no MCP transport needed): validate
// path params + body, build the request, call the API, poll if async, shape result.
export async function dispatch(
  client: ApiClient,
  name: string,
  rawArgs: unknown,
): Promise<ToolResult> {
  const tool = toolByName.get(name)
  if (!tool) return fail(`Unknown tool: ${name}`)

  const args = (rawArgs ?? {}) as Record<string, unknown>

  for (const p of tool.pathParams ?? []) {
    const v = args[p]
    if (typeof v !== 'string' || v.length === 0) {
      return fail(`Missing required path parameter '${p}'.`)
    }
  }

  let body: unknown
  if (tool.body) {
    // Validate with the SAME contract schema the API uses — reject before any
    // network call, so a bad payload never spends a request or provider money.
    const parsed = tool.body.safeParse(extractBody(tool, args))
    if (!parsed.success) {
      return fail(`Invalid input: ${parsed.error.issues[0]?.message ?? 'validation failed'}`)
    }
    body = parsed.data
  }

  const path = tool.path(args as Record<string, string>) + buildQuery(tool.query, args)

  try {
    let result = await client.request(tool.method, path, body)
    // Async lifecycle → one sync call: poll only when the tool submits a job,
    // the caller didn't opt out (wait:false), and the job is actually running.
    if (
      tool.poll &&
      args.wait !== false &&
      isProcessing(tool, result) &&
      (result as { id?: unknown } | null)?.id
    ) {
      result = await client.pollUntil(
        tool.poll.path(result as Record<string, unknown>, args),
        (r) => !isProcessing(tool, r),
        { timeoutMs: tool.poll.timeoutMs, intervalMs: tool.poll.intervalMs },
      )
    }
    return ok(result)
  } catch (err) {
    return fail(errorText(err))
  }
}

// Build a fully-wired MCP server over the given API client. index.ts connects it
// to a stdio transport; tests can drive `dispatch` directly instead.
export function buildServer(client: ApiClient): Server {
  const server = new Server(
    { name: 'opencreate', version: '0.0.1' },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      title: t.title,
      description: t.description,
      inputSchema: toInputSchema(t),
    })),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (req) =>
    dispatch(client, req.params.name, req.params.arguments),
  )

  return server
}
