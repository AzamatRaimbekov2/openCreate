// The tool model + the pure helpers that turn a declarative tool into an HTTP
// request and a JSON-Schema input. Side-effect-free, so the whole mapping is
// unit-testable without a network or an MCP transport.
//
// WHY TOOLS CARRY ACTIONS (ADR mcp-server §P2.5)
//
// Phase 1 declared one tool per endpoint "for explicitness", and recorded that
// this was above the recommended ceiling with an instruction to revisit if the
// cost showed up. It has: the API is now 50 routes, and a faithful table would
// put ~60 tool descriptions into the context of every single request — paid on
// every message whether a tool is used or not, and a model choosing between 60
// near-identical names chooses worse than one choosing between 16.
//
// So related endpoints live behind one tool with an `action`. The CAPABILITIES
// do not shrink — every endpoint is still reachable, and each action still
// validates against the same shared @opencreate/contracts schema the API uses,
// so a tool's input can never drift from what the server accepts. Only the
// number of names the model must hold at once changes.
import { z } from 'zod'
import type { HttpMethod } from './api-client'

// How a submit action's async 202 lifecycle is resolved into one sync call.
export type PollSpec = {
  // Build the GET path to poll from the submit response + the original args
  // (renders need the film id from args; generations carry their own id).
  path: (result: Record<string, unknown>, args: Record<string, unknown>) => string
  statusField?: string // default 'status'
  processing?: string // default 'processing'
  timeoutMs: number
  intervalMs: number
}

// One endpoint, as reachable through its parent tool.
export type ActionDef = {
  // One line, rendered into the tool description so the model can pick an action
  // without a second round trip. This is the only documentation an action gets,
  // so it says what the action DOES and what it needs.
  summary: string
  method: HttpMethod
  // Path params are REQUIRED for this action and substituted into the path.
  pathParams?: string[]
  // Query params are OPTIONAL and appended to the querystring.
  query?: string[]
  // The request body's contract schema (from @opencreate/contracts). Validated
  // before any network call, so a bad payload never spends a request or money.
  body?: z.ZodType
  path: (args: Record<string, string>) => string
  // Present ⇒ this action submits an async job; poll when wait !== false.
  poll?: PollSpec
}

export type ToolDef = {
  name: string
  title: string
  description: string
  actions: Record<string, ActionDef>
}

// Optional query params → `?a=1&b=2` (skips undefined/empty). URLSearchParams
// encodes values so a hostile cursor can't break out of the query.
export function buildQuery(query: string[] | undefined, args: Record<string, unknown>): string {
  if (!query?.length) return ''
  const params = new URLSearchParams()
  for (const q of query) {
    const v = args[q]
    if (v !== undefined && v !== null && v !== '') params.set(q, String(v))
  }
  const s = params.toString()
  return s ? `?${s}` : ''
}

// The body is everything the caller passed that is NOT a path param, a query
// param, or one of the two reserved control keys.
export function extractBody(action: ActionDef, args: Record<string, unknown>): Record<string, unknown> {
  const omit = new Set<string>([...(action.pathParams ?? []), ...(action.query ?? []), 'action', 'wait'])
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(args)) if (!omit.has(k)) out[k] = v
  return out
}

type JsonSchemaObject = {
  type: 'object'
  properties: Record<string, unknown>
  required: string[]
  additionalProperties: boolean
}

// The tool's JSON-Schema input: `action` is the one required property, and every
// param any action can take is merged in as OPTIONAL.
//
// Optional is the honest shape here and not a shortcut. A per-action requirement
// is a discriminated union of a dozen branches, which JSON Schema can express and
// most tool-calling clients handle badly. Requiredness is instead enforced at
// dispatch, per action, against the same contract schema the API uses — so a
// missing field is a clear tool error naming the action, never a silent accept.
export function toInputSchema(tool: ToolDef): JsonSchemaObject {
  const actionNames = Object.keys(tool.actions)
  const properties: Record<string, unknown> = {
    action: {
      type: 'string',
      enum: actionNames,
      description: 'Which operation to perform. See the tool description.',
    },
  }
  let anyPoll = false

  for (const action of Object.values(tool.actions)) {
    for (const p of action.pathParams ?? []) {
      properties[p] ??= { type: 'string', description: `Id/path parameter: ${p}` }
    }
    for (const q of action.query ?? []) {
      properties[q] ??= { type: 'string', description: `Query parameter: ${q}` }
    }
    if (action.body) Object.assign(properties, omitExisting(safeToJsonSchema(action.body), properties))
    if (action.poll) anyPoll = true
  }

  if (anyPoll) {
    properties['wait'] = {
      type: 'boolean',
      description: 'Wait for the async job to finish before returning (default true).',
    }
  }
  return { type: 'object', properties, required: ['action'], additionalProperties: false }
}

// First action to declare a property wins. Two actions sharing a name (create's
// `title` and update's `title`) mean the same field, and the earlier declaration
// is the one whose description was written for the primary use.
function omitExisting(
  incoming: Record<string, unknown>,
  existing: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(incoming)) if (!(k in existing)) out[k] = v
  return out
}

// Guarded: if a schema can't be represented (a transform/effect zod refuses to
// convert), the action still lists with its non-body params — the dispatch-time
// safeParse remains the real validation gate, so nothing is silently accepted.
function safeToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  try {
    const js = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as {
      properties?: Record<string, unknown>
    }
    return js.properties ?? {}
  } catch {
    return {}
  }
}

// The action list, rendered into the tool description so it is visible at
// tools/list time rather than discoverable only by trial and error.
export function describeTool(tool: ToolDef): string {
  const lines = Object.entries(tool.actions).map(([name, a]) => {
    const params = [...(a.pathParams ?? [])]
    const suffix = params.length ? ` (needs ${params.join(', ')})` : ''
    return `• ${name}${suffix} — ${a.summary}`
  })
  return `${tool.description}\n\nActions:\n${lines.join('\n')}`
}

// True while a submitted async job is still running (used to decide whether to poll).
export function isProcessing(action: ActionDef, result: unknown): boolean {
  if (!action.poll) return false
  const field = action.poll.statusField ?? 'status'
  const status = (result as Record<string, unknown> | null)?.[field]
  return status === (action.poll.processing ?? 'processing')
}
