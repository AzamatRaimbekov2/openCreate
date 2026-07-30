// Unit tests for the openCreator brain (ADR opencreator-agent D3): the
// provider-neutral ToolCall layer over Anthropic tool-use (primary) and
// DeepSeek function-calling on DeepInfra (fallback).
//
// Both adapters are tested against INJECTED fakes — no network, no API keys — so
// these assertions pin the REQUEST SHAPE each provider receives, which is the
// part a refactor silently breaks (a mis-mapped tool_result id makes the model
// answer as if the tool never ran, and nothing throws).
import { describe, expect, it, vi } from 'vitest'
import {
  CreatorUnavailableError,
  buildBrainChain,
  completeWithBrains,
  createAnthropicBrain,
  createDeepseekBrain,
} from '../src/modules/creator/brain'
import type { Brain, BrainToolSpec, BrainTurn } from '../src/modules/creator/brain'

const CANVAS_TOOL: BrainToolSpec = {
  name: 'create_canvas',
  description: 'Create an empty canvas',
  inputSchema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
}
const TOOLS: BrainToolSpec[] = [CANVAS_TOOL]

// Just the three fields these assertions read off the captured request.
type SeenParams = { system: string; messages: unknown[]; tools: unknown[] }

// Minimal Anthropic-shaped fake: captures the params and answers with content blocks.
const fakeAnthropic = (content: unknown[], onCall?: (params: unknown) => void) => ({
  messages: {
    create: vi.fn(async (params: unknown) => {
      onCall?.(params)
      return { content } as never
    }),
  },
})

// Minimal fetch fake for the DeepInfra OpenAI-compatible endpoint.
const fakeFetch = (body: unknown, ok = true, status = 200) =>
  vi.fn(async () => ({ ok, status, json: async () => body }) as unknown as Response)

describe('anthropic brain adapter', () => {
  it('maps system, tools and turns into one messages.create call', async () => {
    let seen: SeenParams | undefined
    const client = fakeAnthropic([{ type: 'text', text: 'ok' }], (p) => (seen = p as SeenParams))
    const brain = createAnthropicBrain('key', () => client)

    const turns: BrainTurn[] = [
      { role: 'user', text: 'сделай канвас' },
      { role: 'assistant', toolCalls: [{ id: 'tu1', name: 'create_canvas', input: { title: 'Fox' } }] },
      { role: 'toolResults', results: [{ toolCallId: 'tu1', output: '{"canvasId":"c1"}' }] },
    ]
    await brain.complete('SYSTEM', turns, TOOLS)

    expect(brain.id).toBe('anthropic')
    expect(seen?.system).toBe('SYSTEM')
    // Anthropic takes input_schema (snake), not inputSchema.
    expect(seen?.tools).toEqual([
      { name: 'create_canvas', description: 'Create an empty canvas', input_schema: CANVAS_TOOL.inputSchema },
    ])
    expect(seen?.messages[0]).toEqual({ role: 'user', content: 'сделай канвас' })
    expect(seen?.messages[1]).toEqual({
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'tu1', name: 'create_canvas', input: { title: 'Fox' } }],
    })
    // A tool result is a USER-role turn carrying tool_result blocks keyed by the
    // ORIGINAL tool_use id — the one thing that ties an answer to its question.
    expect(seen?.messages[2]).toEqual({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'tu1', content: '{"canvasId":"c1"}' }],
    })
  })

  it('parses a text-only reply', async () => {
    const client = fakeAnthropic([
      { type: 'text', text: 'Готово. ' },
      { type: 'text', text: 'Канвас создан.' },
    ])
    const reply = await createAnthropicBrain('key', () => client).complete('S', [], TOOLS)
    expect(reply.text).toBe('Готово. Канвас создан.')
    expect(reply.toolCalls).toEqual([])
  })

  it('parses tool_use blocks into neutral tool calls', async () => {
    const client = fakeAnthropic([
      { type: 'text', text: 'создаю' },
      { type: 'tool_use', id: 'tu9', name: 'create_canvas', input: { title: 'Fox' } },
    ])
    const reply = await createAnthropicBrain('key', () => client).complete('S', [], TOOLS)
    expect(reply.text).toBe('создаю')
    expect(reply.toolCalls).toEqual([{ id: 'tu9', name: 'create_canvas', input: { title: 'Fox' } }])
  })

  it('replays the provider content blocks VERBATIM on the next call', async () => {
    // Thinking blocks carry signatures and MUST come back unmodified next to
    // their tool_use, or the API rejects the follow-up turn. The neutral layer
    // therefore hands the raw blocks back through `raw` instead of rebuilding
    // the assistant turn from text + toolCalls.
    const blocks = [
      { type: 'thinking', thinking: '', signature: 'sig-abc' },
      { type: 'tool_use', id: 'tu1', name: 'create_canvas', input: { title: 'Fox' } },
    ]
    let seen: SeenParams | undefined
    const client = fakeAnthropic([{ type: 'text', text: 'ok' }], (p) => (seen = p as SeenParams))
    const brain = createAnthropicBrain('key', () => client)
    const first = await createAnthropicBrain('key', () => fakeAnthropic(blocks)).complete('S', [], TOOLS)
    expect(first.raw).toEqual(blocks)

    await brain.complete(
      'S',
      [
        { role: 'user', text: 'go' },
        { role: 'assistant', toolCalls: first.toolCalls, raw: first.raw },
      ],
      TOOLS,
    )
    expect(seen?.messages[1]).toEqual({ role: 'assistant', content: blocks })
  })

  it('throws a SANITIZED error when the provider fails', async () => {
    // The SDK error can carry a provider body; only a neutral category may
    // escape (the enhancer's discipline — nothing provider-authored is logged
    // or returned).
    const client = {
      messages: {
        create: vi.fn(async () => {
          throw Object.assign(new Error('400 {"error":{"message":"account xyz is out of credit"}}'), {
            status: 400,
          })
        }),
      },
    }
    const brain = createAnthropicBrain('key', () => client as never)
    await expect(brain.complete('S', [], TOOLS)).rejects.toThrow(/HTTP 400/)
    await expect(brain.complete('S', [], TOOLS)).rejects.not.toThrow(/account xyz/)
  })
})

describe('deepseek brain adapter', () => {
  it('maps the request to OpenAI function-calling shape on DeepInfra', async () => {
    const fetchImpl = fakeFetch({ choices: [{ message: { content: 'ok' } }] })
    const brain = createDeepseekBrain('token', fetchImpl as unknown as typeof fetch)
    const turns: BrainTurn[] = [
      { role: 'user', text: 'go' },
      { role: 'assistant', text: 'работаю', toolCalls: [{ id: 'c1', name: 'create_canvas', input: { title: 'Fox' } }] },
      { role: 'toolResults', results: [{ toolCallId: 'c1', output: '{"canvasId":"x"}' }] },
    ]
    await brain.complete('SYSTEM', turns, TOOLS)

    expect(brain.id).toBe('deepseek')
    const [url, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0]!
    expect(url).toBe('https://api.deepinfra.com/v1/openai/chat/completions')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token')
    const body = JSON.parse(init.body as string)
    // The SAME DeepSeek model id the prompt enhancer uses (one place to bump).
    expect(body.model).toBe('deepseek-ai/DeepSeek-V3-0324')
    expect(body.tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'create_canvas',
          description: 'Create an empty canvas',
          parameters: CANVAS_TOOL.inputSchema,
        },
      },
    ])
    expect(body.messages[0]).toEqual({ role: 'system', content: 'SYSTEM' })
    expect(body.messages[1]).toEqual({ role: 'user', content: 'go' })
    expect(body.messages[2]).toEqual({
      role: 'assistant',
      content: 'работаю',
      tool_calls: [
        { id: 'c1', type: 'function', function: { name: 'create_canvas', arguments: '{"title":"Fox"}' } },
      ],
    })
    // OpenAI wants ONE role:'tool' message per result, not a block list.
    expect(body.messages[3]).toEqual({ role: 'tool', tool_call_id: 'c1', content: '{"canvasId":"x"}' })
  })

  it('parses a text-only reply', async () => {
    const brain = createDeepseekBrain(
      'token',
      fakeFetch({ choices: [{ message: { content: 'Готово' } }] }) as unknown as typeof fetch,
    )
    const reply = await brain.complete('S', [], TOOLS)
    expect(reply).toEqual({ text: 'Готово', toolCalls: [] })
  })

  it('parses tool_calls with JSON arguments', async () => {
    const brain = createDeepseekBrain(
      'token',
      fakeFetch({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                { id: 'c7', type: 'function', function: { name: 'create_canvas', arguments: '{"title":"Fox"}' } },
              ],
            },
          },
        ],
      }) as unknown as typeof fetch,
    )
    const reply = await brain.complete('S', [], TOOLS)
    expect(reply.text).toBeUndefined()
    expect(reply.toolCalls).toEqual([{ id: 'c7', name: 'create_canvas', input: { title: 'Fox' } }])
  })

  it('turns malformed arguments into an EMPTY input, never a crash', async () => {
    // A truncated arguments string must reach the tool as data (its zod schema
    // then answers the model with an error string) — a JSON.parse throw here
    // would kill the whole agent turn.
    const brain = createDeepseekBrain(
      'token',
      fakeFetch({
        choices: [
          {
            message: {
              tool_calls: [{ id: 'c8', function: { name: 'create_canvas', arguments: '{"title":' } }],
            },
          },
        ],
      }) as unknown as typeof fetch,
    )
    const reply = await brain.complete('S', [], TOOLS)
    expect(reply.toolCalls).toEqual([{ id: 'c8', name: 'create_canvas', input: {} }])
  })

  it('throws on an HTTP error and on an empty answer', async () => {
    const failing = createDeepseekBrain(
      'token',
      fakeFetch({}, false, 429) as unknown as typeof fetch,
    )
    await expect(failing.complete('S', [], TOOLS)).rejects.toThrow(/HTTP 429/)

    const empty = createDeepseekBrain(
      'token',
      fakeFetch({ choices: [{ message: { content: '' } }] }) as unknown as typeof fetch,
    )
    await expect(empty.complete('S', [], TOOLS)).rejects.toThrow()
  })
})

describe('buildBrainChain', () => {
  it('orders anthropic first, deepseek second, and drops unconfigured providers', () => {
    expect(buildBrainChain('key', 'token').map((b) => b.id)).toEqual(['anthropic', 'deepseek'])
    expect(buildBrainChain(null, 'token').map((b) => b.id)).toEqual(['deepseek'])
    expect(buildBrainChain('key', null).map((b) => b.id)).toEqual(['anthropic'])
    expect(buildBrainChain(null, null)).toEqual([])
  })
})

describe('completeWithBrains', () => {
  const ok = (text: string): Brain => ({
    id: 'deepseek',
    complete: vi.fn(async () => ({ text, toolCalls: [] })),
  })
  const dead = (): Brain => ({
    id: 'anthropic',
    complete: vi.fn(async () => {
      throw new Error('HTTP 500')
    }),
  })

  it('falls through to the next brain on ANY failure and logs the hop', async () => {
    const warn = vi.fn()
    const first = dead()
    const second = ok('from fallback')
    const reply = await completeWithBrains([first, second], 'S', [], TOOLS, { warn })
    expect(reply.text).toBe('from fallback')
    expect(first.complete).toHaveBeenCalledOnce()
    expect(warn).toHaveBeenCalledOnce()
    // A silently absorbed dead provider hides a dead provider (failover-provider
    // precedent): the hop is a warn line naming the provider and the category.
    expect(warn.mock.calls[0]?.[0]).toMatchObject({
      event: 'creator.provider_failed',
      provider: 'anthropic',
      reason: 'HTTP 500',
    })
  })

  it('refuses with CreatorUnavailableError when nothing is configured', async () => {
    await expect(completeWithBrains([], 'S', [], TOOLS)).rejects.toBeInstanceOf(
      CreatorUnavailableError,
    )
  })

  it('refuses with CreatorUnavailableError when every brain fails', async () => {
    const error = await completeWithBrains([dead(), dead()], 'S', [], TOOLS).catch((e) => e)
    expect(error).toBeInstanceOf(CreatorUnavailableError)
    // Shaped for app.ts's central handler: 502 + the shared provider_error code.
    expect(error.statusCode).toBe(502)
    expect(error.apiCode).toBe('provider_error')
    // The message reaches the chat verbatim — it must never carry a provider body.
    expect(error.message).not.toMatch(/HTTP 500/)
  })
})
