// Wires the declarative tool table onto an MCP Server: advertises every tool
// (tools/list) and dispatches calls (tools/call). Uses the SDK's LOW-LEVEL Server
// with hand-built JSON Schema rather than the high-level zod-shape helper, so the
// package is decoupled from whichever zod version the SDK bundles — our contract
// schemas (zod 4) are converted once via z.toJSONSchema and validated by us.
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { ApiError, type RestClient } from './api-client'
import { buildQuery, describeTool, extractBody, isProcessing, toInputSchema } from './registry'
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
  client: RestClient,
  name: string,
  rawArgs: unknown,
): Promise<ToolResult> {
  const tool = toolByName.get(name)
  if (!tool) return fail(`Unknown tool: ${name}`)

  const args = (rawArgs ?? {}) as Record<string, unknown>

  // `action` is the one required input on every tool (ADR mcp-server §P2.5).
  // Naming the valid actions in the error matters: a model that guessed wrong
  // can correct itself from this line instead of re-listing tools.
  const actionName = args.action
  if (typeof actionName !== 'string') {
    return fail(`Tool '${name}' needs an 'action'. Valid: ${Object.keys(tool.actions).join(', ')}.`)
  }
  const action = tool.actions[actionName]
  if (!action) {
    return fail(
      `Unknown action '${actionName}' for '${name}'. Valid: ${Object.keys(tool.actions).join(', ')}.`,
    )
  }

  // Path params are required PER ACTION — the tool's JSON Schema cannot express
  // that without a discriminated union, so it is enforced here (registry.ts).
  for (const p of action.pathParams ?? []) {
    const v = args[p]
    if (typeof v !== 'string' || v.length === 0) {
      return fail(`Action '${name}.${actionName}' needs the path parameter '${p}'.`)
    }
  }

  let body: unknown
  if (action.body) {
    // Validate with the SAME contract schema the API uses — reject before any
    // request, so a bad payload never spends a request or provider money.
    const parsed = action.body.safeParse(extractBody(action, args))
    if (!parsed.success) {
      return fail(`Invalid input for '${name}.${actionName}': ${parsed.error.issues[0]?.message ?? 'validation failed'}`)
    }
    body = parsed.data
  }

  const path = action.path(args as Record<string, string>) + buildQuery(action.query, args)

  try {
    let result = await client.request(action.method, path, body)
    // Async lifecycle → one sync call: poll only when the action submits a job,
    // the caller didn't opt out (wait:false), and the job is actually running.
    if (
      action.poll &&
      args.wait !== false &&
      isProcessing(action, result) &&
      (result as { id?: unknown } | null)?.id
    ) {
      result = await client.pollUntil(
        action.poll.path(result as Record<string, unknown>, args),
        (r) => !isProcessing(action, r),
        { timeoutMs: action.poll.timeoutMs, intervalMs: action.poll.intervalMs },
      )
    }
    return ok(result)
  } catch (err) {
    return fail(errorText(err))
  }
}

// Build a fully-wired MCP server over the given API client. index.ts connects it
// to a stdio transport; tests can drive `dispatch` directly instead.
export function buildServer(client: RestClient): Server {
  const server = new Server(
    { name: 'opencreate', version: '0.0.1' },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      title: t.title,
      // The action list is rendered INTO the description, so a model can pick an
      // action at tools/list time instead of discovering them by trial.
      description: describeTool(t),
      inputSchema: toInputSchema(t),
    })),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (req) =>
    dispatch(client, req.params.name, req.params.arguments),
  )

  return server
}
