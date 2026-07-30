// apps/api/src/modules/creator/brain.ts
// openCreator's BRAIN: a provider-neutral tool-calling layer (ADR
// opencreator-agent D3) with two adapters — Anthropic Messages tool-use
// (primary, the key already powers storyboard/analyze) and DeepSeek
// function-calling on DeepInfra (fallback, the key already powers the prompt
// enhancer). The agent loop in service.ts speaks ONLY the neutral types below,
// so it never learns whose format is under it and a third provider is one more
// adapter plus one line in buildBrainChain.
//
// Same optional-secret discipline as enhance.ts / storyboard.ts: an unset key
// drops its adapter from the chain, an empty chain is a clean 502 provider_error,
// and NO provider-authored text ever reaches the client or the log — only a
// neutral category (HTTP status / network / invalid answer). A provider body can
// name our account or balance (DeepInfra's no-balance message does), and here the
// failure text lands in the user's CHAT, so the rule is even less negotiable than
// usual.
import Anthropic from '@anthropic-ai/sdk'
import type { FastifyBaseLogger } from 'fastify'

// ── the neutral layer ────────────────────────────────────────────────────────

export type BrainToolSpec = {
  name: string
  description: string
  // JSON Schema for the tool input. Both providers take it near-verbatim
  // (Anthropic: `input_schema`, OpenAI/DeepSeek: `function.parameters`), which is
  // why this stays a plain schema object rather than a zod instance — tools.ts
  // keeps its own zod schema for VALIDATION and hands the model the JSON Schema.
  inputSchema: { type: 'object' } & Record<string, unknown>
}

export type BrainToolCall = { id: string; name: string; input: unknown }

// The loop's transcript entry — provider-neutral. `toolResults` answers the
// PREVIOUS assistant turn's calls (Anthropic: user-role tool_result blocks;
// DeepSeek: role:'tool' messages).
//
// `raw` is a PROVIDER-SCOPED OPAQUE payload, and it is not decoration: Anthropic
// returns thinking blocks alongside tool_use, each carrying a signature, and the
// API rejects a follow-up turn whose assistant content was rebuilt without them
// ("a final assistant message must start with a thinking block"). Rebuilding the
// turn from text + toolCalls would therefore break the SECOND step of every
// agent turn. So each adapter hands its own blocks back through `raw` and
// replays them verbatim; the DeepSeek adapter ignores the field entirely.
export type BrainTurn =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text?: string; toolCalls?: BrainToolCall[]; raw?: unknown }
  | { role: 'toolResults'; results: { toolCallId: string; output: string }[] }

export type BrainReply = { text?: string; toolCalls: BrainToolCall[]; raw?: unknown }

export type Brain = {
  id: 'anthropic' | 'deepseek'
  complete(system: string, turns: BrainTurn[], tools: BrainToolSpec[]): Promise<BrainReply>
}

// 502 provider_error — the SAME envelope storyboard/enhance use, shaped
// (statusCode + apiCode) for app.ts's central error handler. Its `message` is
// written to be shown: the loop puts it straight into an assistant chat message
// when a turn dies, so it must stay free of provider text.
export class CreatorUnavailableError extends Error {
  statusCode = 502
  apiCode = 'provider_error'
  constructor(message = 'The creator agent is not configured') {
    super(message)
    this.name = 'CreatorUnavailableError'
  }
}

// Only `warn` is used: a provider failing over to the next is diagnosable, not
// user-facing — the money-path failover precedent. Structural so production
// passes app.log and a test passes { warn: vi.fn() }.
type BrainLog = Pick<FastifyBaseLogger, 'warn'>

// ── Anthropic adapter (primary) ──────────────────────────────────────────────

// Sonnet 5 rather than the opus-4-8 storyboard uses: this is a TOOL-SELECTION
// loop of up to MAX_STEPS calls per user turn, so the per-step price is paid
// 16 times over, and picking the next tool is not the hard reasoning storyboard
// does in one shot. (Plan §Task 3 names this model.)
const ANTHROPIC_MODEL = 'claude-sonnet-5'
// Enough for a tool call plus adaptive thinking; the agent's prose answers are
// short (the system prompt asks for brief reports), so this is not the ceiling
// on quality — it is the ceiling on one runaway step.
const ANTHROPIC_MAX_TOKENS = 4096
// 'medium' is the cost/quality lever for a loop this shape: the model must pick
// the right tool and fill three fields, not plan a system. High effort would pay
// deep reasoning tokens 16 times per task for no better tool choice.
const ANTHROPIC_EFFORT = 'medium' as const

// Just enough of the SDK's surface for this adapter, so a test can hand over a
// two-line fake instead of a whole client. The real Anthropic client satisfies it.
type AnthropicLike = {
  messages: {
    create: (params: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message>
  }
}

function toAnthropicMessages(turns: BrainTurn[]): Anthropic.MessageParam[] {
  return turns.map((turn): Anthropic.MessageParam => {
    if (turn.role === 'user') return { role: 'user', content: turn.text }
    if (turn.role === 'toolResults') {
      // Tool results are a USER turn in Anthropic's format. The tool_use_id is
      // the only thing tying an answer to its question — mismap it and the model
      // reads the reply as belonging to another call, silently.
      return {
        role: 'user',
        content: turn.results.map((result) => ({
          type: 'tool_result' as const,
          tool_use_id: result.toolCallId,
          content: result.output,
        })),
      }
    }
    // Verbatim replay when we have the provider's own blocks — see the `raw` note
    // on BrainTurn (thinking signatures). The rebuild below is the fallback for
    // turns that did not come from this adapter (a DeepSeek turn replayed after a
    // mid-turn failover, or a hand-built turn in a test).
    if (Array.isArray(turn.raw))
      return { role: 'assistant', content: turn.raw as Anthropic.ContentBlockParam[] }
    const content: Anthropic.ContentBlockParam[] = []
    if (turn.text) content.push({ type: 'text', text: turn.text })
    for (const call of turn.toolCalls ?? [])
      content.push({ type: 'tool_use', id: call.id, name: call.name, input: call.input })
    return { role: 'assistant', content }
  })
}

export function createAnthropicBrain(
  apiKey: string,
  // Injected so tests assert the request shape and drive failures without a
  // network or a key (the enhancer's fetchImpl seam, one level up).
  createClient: (apiKey: string) => AnthropicLike = (key) => new Anthropic({ apiKey: key }),
): Brain {
  const client = createClient(apiKey)
  return {
    id: 'anthropic',
    async complete(system, turns, tools) {
      let res: Anthropic.Message
      try {
        res = await client.messages.create({
          model: ANTHROPIC_MODEL,
          max_tokens: ANTHROPIC_MAX_TOKENS,
          // Adaptive thinking (the only on-mode on current models) with a
          // moderate effort: the loop needs sound tool choice, not deep analysis.
          thinking: { type: 'adaptive' },
          output_config: { effort: ANTHROPIC_EFFORT },
          system,
          messages: toAnthropicMessages(turns),
          tools: tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.inputSchema,
          })),
        })
      } catch (err) {
        // SANITIZE HERE, not at the call site: the SDK's message embeds the
        // provider's JSON body (which can name our account). Only the status
        // category may travel — into the chain's warn line and nowhere else.
        const status = (err as { status?: number }).status
        throw new Error(typeof status === 'number' ? `HTTP ${status}` : 'network error')
      }
      const texts: string[] = []
      const toolCalls: BrainToolCall[] = []
      for (const block of res.content) {
        if (block.type === 'text') texts.push(block.text)
        else if (block.type === 'tool_use')
          toolCalls.push({ id: block.id, name: block.name, input: block.input })
        // Everything else (thinking, redacted_thinking, …) is carried only by
        // `raw` below: the loop has no use for it, and it must not be rebuilt.
      }
      return {
        ...(texts.length > 0 ? { text: texts.join('') } : {}),
        toolCalls,
        // Response blocks are structurally the param blocks for replay purposes;
        // the cast is what lets a signed thinking block round-trip untouched.
        raw: res.content as unknown as Anthropic.ContentBlockParam[],
      }
    },
  }
}

// ── DeepSeek adapter (fallback) ──────────────────────────────────────────────

// The same OpenAI-compatible surface and the same model id the prompt enhancer
// uses (modules/prompt/enhance.ts) — deliberately duplicated as a constant
// rather than imported: the enhancer is a text rewriter and may re-tune its
// model without dragging the agent's brain along.
const DEEPINFRA_CHAT_URL = 'https://api.deepinfra.com/v1/openai/chat/completions'
const DEEPSEEK_MODEL = 'deepseek-ai/DeepSeek-V3-0324'
// An agent step is a control-plane call inside a detached turn: give it room,
// but never let a hung socket hold the turn open forever.
const REQUEST_TIMEOUT_MS = 60 * 1000

type OpenAiMessage =
  | { role: 'system' | 'user'; content: string }
  | {
      role: 'assistant'
      content: string | null
      tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[]
    }
  | { role: 'tool'; tool_call_id: string; content: string }

function toOpenAiMessages(system: string, turns: BrainTurn[]): OpenAiMessage[] {
  const messages: OpenAiMessage[] = [{ role: 'system', content: system }]
  for (const turn of turns) {
    if (turn.role === 'user') {
      messages.push({ role: 'user', content: turn.text })
    } else if (turn.role === 'assistant') {
      const calls = turn.toolCalls ?? []
      messages.push({
        role: 'assistant',
        content: turn.text ?? null,
        ...(calls.length > 0
          ? {
              tool_calls: calls.map((call) => ({
                id: call.id,
                type: 'function' as const,
                function: { name: call.name, arguments: JSON.stringify(call.input ?? {}) },
              })),
            }
          : {}),
      })
    } else {
      // ONE message per result here (Anthropic uses one turn with N blocks) —
      // the single real shape difference between the two providers.
      for (const result of turn.results)
        messages.push({ role: 'tool', tool_call_id: result.toolCallId, content: result.output })
    }
  }
  return messages
}

export function createDeepseekBrain(token: string, fetchImpl: typeof fetch = fetch): Brain {
  return {
    id: 'deepseek',
    async complete(system, turns, tools) {
      let res: Response
      try {
        res = await fetchImpl(DEEPINFRA_CHAT_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: DEEPSEEK_MODEL,
            messages: toOpenAiMessages(system, turns),
            tools: tools.map((tool) => ({
              type: 'function',
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.inputSchema,
              },
            })),
            // Low but non-zero, like the enhancer: tool choice should be
            // reproducible, not creative.
            temperature: 0.3,
            max_tokens: 2048,
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
      } catch {
        throw new Error('network error')
      }
      // Status only — the body may name our DeepInfra balance.
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = (await res.json().catch(() => null)) as {
        choices?: {
          message?: {
            content?: string | null
            tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[]
          }
        }[]
      } | null
      const message = body?.choices?.[0]?.message
      if (!message) throw new Error('invalid answer')
      const toolCalls: BrainToolCall[] = []
      for (const call of message.tool_calls ?? []) {
        if (!call.id || !call.function?.name) continue
        toolCalls.push({ id: call.id, name: call.function.name, input: parseArguments(call.function.arguments) })
      }
      const text = typeof message.content === 'string' ? message.content.trim() : ''
      // A reply with neither text nor a tool call is a dead answer, not a turn:
      // failing here falls through to... nothing (DeepSeek is last), so the loop
      // gets a clean CreatorUnavailableError instead of an empty chat bubble.
      if (text === '' && toolCalls.length === 0) throw new Error('empty answer')
      return { ...(text !== '' ? { text } : {}), toolCalls }
    },
  }
}

// A truncated/invalid arguments string must NOT kill the turn. Returning {} makes
// it an ordinary bad tool input: the tool's own zod schema answers the model with
// an error string and the model retries — a failed call, not a crash.
function parseArguments(raw: string | undefined): unknown {
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

// ── the chain ────────────────────────────────────────────────────────────────

// Ordered chain of the CONFIGURED brains: Anthropic primary (best tool-use
// discipline), DeepSeek the cheap fallback. An unset key drops its adapter, so an
// empty array means "nothing configured" → 502 rather than a crash at boot.
export function buildBrainChain(
  anthropicApiKey: string | null,
  deepinfraToken: string | null,
): Brain[] {
  const chain: Brain[] = []
  if (anthropicApiKey) chain.push(createAnthropicBrain(anthropicApiKey))
  if (deepinfraToken) chain.push(createDeepseekBrain(deepinfraToken))
  return chain
}

// Try each brain IN ORDER; ANY failure (HTTP, network, malformed answer) falls
// through to the next, and only when all of them are gone does the caller see a
// CreatorUnavailableError. Distinct messages for "nothing configured" (a misconfig
// an operator must fix) and "everything failed" (transient) — both 502, exactly
// like the enhancer.
export async function completeWithBrains(
  brains: Brain[],
  system: string,
  turns: BrainTurn[],
  tools: BrainToolSpec[],
  log?: BrainLog | null,
): Promise<BrainReply> {
  if (brains.length === 0) throw new CreatorUnavailableError()
  for (const brain of brains) {
    try {
      return await brain.complete(system, turns, tools)
    } catch (err) {
      // A chain that silently absorbs a dead provider HIDES a dead provider
      // (failover-provider precedent): every hop is a warn line. `reason` is
      // already a neutral category — each adapter sanitizes before throwing.
      log?.warn(
        {
          event: 'creator.provider_failed',
          provider: brain.id,
          reason: err instanceof Error ? err.message : 'unknown',
        },
        'creator brain failed, trying next',
      )
    }
  }
  throw new CreatorUnavailableError('The creator agent is temporarily unavailable')
}
