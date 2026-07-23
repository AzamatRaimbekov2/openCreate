// The tool model + the pure helpers that turn a declarative ToolDef into an HTTP
// request and a JSON-Schema input. Kept side-effect-free so the whole mapping is
// unit-testable without a network or an MCP transport.
//
// A ToolDef is intentionally thin: openCreate already owns validation (shared
// @opencreate/contracts zod schemas) and error shaping (uniform envelope), so a
// tool is just "which verb, which path, which contract schema, and is it async".
import { z } from 'zod'
import type { HttpMethod } from './api-client'

// How a submit tool's async 202 lifecycle is resolved into one sync call.
export type PollSpec = {
  // Build the GET path to poll from the submit response + the original args
  // (renders need the film id from args; generations carry their own id).
  path: (result: Record<string, unknown>, args: Record<string, unknown>) => string
  statusField?: string // default 'status'
  processing?: string // default 'processing'
  timeoutMs: number
  intervalMs: number
}

export type ToolDef = {
  name: string
  title: string
  description: string
  method: HttpMethod
  // Path params are REQUIRED string args, substituted into the path.
  pathParams?: string[]
  // Query params are OPTIONAL string args appended to the querystring.
  query?: string[]
  // The request body's contract schema (from @opencreate/contracts). Its fields
  // become flat, top-level input props alongside the path params.
  body?: z.ZodType
  // Build the path from the validated args (path params only).
  path: (args: Record<string, string>) => string
  // Present ⇒ this tool submits an async job; the server polls when wait!==false.
  poll?: PollSpec
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

// The request body is everything the caller passed that is NOT a path param, a
// query param, or the reserved `wait` flag. It is then validated by the tool's
// contract schema in the server before being sent.
export function extractBody(tool: ToolDef, args: Record<string, unknown>): Record<string, unknown> {
  const omit = new Set<string>([...(tool.pathParams ?? []), ...(tool.query ?? []), 'wait'])
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(args)) if (!omit.has(k)) out[k] = v
  return out
}

type JsonSchemaObject = { type: 'object'; properties: Record<string, unknown>; required: string[]; additionalProperties: boolean }

// Derive the tool's JSON-Schema input by merging path/query params with the
// contract body schema converted via zod's native toJSONSchema. Guarded: if a
// schema can't be represented (a transform/effect zod refuses to convert), the
// tool still lists with its non-body params — the server's zod safeParse remains
// the real validation gate, so nothing is silently accepted.
export function toInputSchema(tool: ToolDef): JsonSchemaObject {
  const properties: Record<string, unknown> = {}
  const required: string[] = []

  for (const p of tool.pathParams ?? []) {
    properties[p] = { type: 'string', description: `Path parameter: ${p}` }
    required.push(p)
  }
  for (const q of tool.query ?? []) {
    properties[q] = { type: 'string', description: `Query parameter: ${q}` }
  }
  if (tool.body) {
    const bodyJson = safeToJsonSchema(tool.body)
    Object.assign(properties, bodyJson.properties ?? {})
    if (Array.isArray(bodyJson.required)) required.push(...bodyJson.required)
  }
  if (tool.poll) {
    properties['wait'] = {
      type: 'boolean',
      description: 'Wait for the async job to finish before returning (default true).',
    }
  }
  return { type: 'object', properties, required, additionalProperties: false }
}

function safeToJsonSchema(schema: z.ZodType): { properties: Record<string, unknown>; required: string[] } {
  try {
    const js = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as {
      properties?: Record<string, unknown>
      required?: string[]
    }
    return { properties: js.properties ?? {}, required: js.required ?? [] }
  } catch {
    return { properties: {}, required: [] }
  }
}

// True while a submitted async job is still running (used to decide whether to poll).
export function isProcessing(tool: ToolDef, result: unknown): boolean {
  if (!tool.poll) return false
  const field = tool.poll.statusField ?? 'status'
  const status = (result as Record<string, unknown> | null)?.[field]
  return status === (tool.poll.processing ?? 'processing')
}
