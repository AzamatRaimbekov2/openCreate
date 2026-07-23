import { describe, expect, it, vi } from 'vitest'
import {
  buildEnhanceChain,
  createGroqCompleter,
  createPromptEnhanceService,
  parseEnhanceResult,
  PromptEnhanceUnavailableError,
  type Completer,
} from '../src/modules/prompt/enhance'
import { buildTestApp, registerAndGetCookie } from './helpers/build-test-app'

const GOOD = JSON.stringify({
  prompt: 'A lone fox pads across fresh snow at dawn, breath misting in the cold blue light.',
})

// A fake completer that always succeeds with `raw`.
const ok = (id: string, raw: string): Completer => ({ id, complete: vi.fn(async () => raw) })
// A fake completer that always fails (a stand-in for no-balance / 5xx / network).
const fail = (id: string, msg = 'boom'): Completer => ({
  id,
  complete: vi.fn(async () => {
    throw new Error(msg)
  }),
})

describe('parseEnhanceResult', () => {
  it('parses a valid { prompt } object', () => {
    expect(parseEnhanceResult(GOOD).prompt).toContain('lone fox')
  })
  it('strips an accidental ```json fence', () => {
    expect(parseEnhanceResult('```json\n' + GOOD + '\n```').prompt).toContain('lone fox')
  })
  it('rejects unreadable output as a clean provider error', () => {
    expect(() => parseEnhanceResult('not json at all')).toThrow(PromptEnhanceUnavailableError)
  })
  it('rejects a valid-JSON-but-empty prompt', () => {
    expect(() => parseEnhanceResult(JSON.stringify({ prompt: '' }))).toThrow(
      PromptEnhanceUnavailableError,
    )
  })
})

describe('buildEnhanceChain', () => {
  it('is empty when nothing is configured', () => {
    expect(buildEnhanceChain(null, null)).toHaveLength(0)
  })
  it('has only DeepInfra when only its token is set', () => {
    expect(buildEnhanceChain('dk', null).map((c) => c.id)).toEqual(['deepinfra'])
  })
  it('has only Groq when only its key is set', () => {
    expect(buildEnhanceChain(null, 'gk').map((c) => c.id)).toEqual(['groq'])
  })
  it('tries DeepInfra first, then Groq, when both are set', () => {
    expect(buildEnhanceChain('dk', 'gk').map((c) => c.id)).toEqual(['deepinfra', 'groq'])
  })
})

describe('createGroqCompleter', () => {
  it('POSTs an OpenAI-compatible request to Groq and returns the raw content', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: GOOD } }] }), { status: 200 }),
    )
    const groq = createGroqCompleter('gk-test', fetchMock)
    const raw = await groq.complete('SYSTEM', 'USER')

    expect(groq.id).toBe('groq')
    expect(raw).toBe(GOOD)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions')
    const headers = init!.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer gk-test')
    const body = JSON.parse(init!.body as string) as {
      model: string
      messages: { role: string; content: string }[]
      temperature: number
      max_tokens: number
    }
    expect(body.model).toBe('llama-3.3-70b-versatile')
    expect(body.messages).toEqual([
      { role: 'system', content: 'SYSTEM' },
      { role: 'user', content: 'USER' },
    ])
    expect(body.temperature).toBe(0.4)
    expect(body.max_tokens).toBe(700)
  })

  it('throws a SANITIZED error on a non-2xx so the chain can fall through', async () => {
    // A DeepInfra/Groq no-balance body must never reach the error message.
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response('You need positive balance to do inference', { status: 402 }),
    )
    const groq = createGroqCompleter('gk', fetchMock)
    let caught: unknown
    try {
      await groq.complete('s', 'u')
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toContain('HTTP 402')
    expect((caught as Error).message).not.toContain('balance')
  })
})

describe('promptEnhance.enhance', () => {
  it('rewrites a rough idea into the model prompt (enhance mode)', async () => {
    const complete = vi.fn<(system: string, user: string) => Promise<string>>(async () => GOOD)
    const svc = createPromptEnhanceService({
      deepinfraToken: null,
      groqApiKey: null,
      completers: [{ id: 'p', complete }],
    })
    const { prompt } = await svc.enhance({ text: 'котик на стене', mode: 'enhance' })
    expect(prompt).toContain('lone fox')
    const [system] = complete.mock.calls[0]!
    expect(system).not.toMatch(/safety rewrite/i)
  })

  it('soften mode carries the safety-rewrite instruction and returns the softened line', async () => {
    const complete = vi.fn<(system: string, user: string) => Promise<string>>(async () =>
      JSON.stringify({ prompt: 'two figures clash dramatically in the driving rain' }),
    )
    const svc = createPromptEnhanceService({
      deepinfraToken: null,
      groqApiKey: null,
      completers: [{ id: 'p', complete }],
    })
    const { prompt } = await svc.enhance({
      text: 'a man stabs another and blood sprays everywhere',
      mode: 'soften',
    })
    expect(prompt).not.toMatch(/blood|stab/i)
    const [system] = complete.mock.calls[0]!
    expect(system).toMatch(/safety rewrite/i)
  })

  it('copies a [[e1]] cast token verbatim (enhance mode)', async () => {
    const complete = vi.fn<(system: string, user: string) => Promise<string>>(async () =>
      JSON.stringify({ prompt: '[[e1]] runs down a rain-slick neon alley at night' }),
    )
    const svc = createPromptEnhanceService({
      deepinfraToken: null,
      groqApiKey: null,
      completers: [{ id: 'p', complete }],
    })
    const { prompt } = await svc.enhance({ text: '[[e1]] бежит по переулку', mode: 'enhance' })
    expect(prompt).toContain('[[e1]]')
    const [system, user] = complete.mock.calls[0]!
    expect(system).toContain('[[eN]]')
    expect(user).toContain('[[e1]]')
  })

  it('preserves a [[e1]] cast token verbatim THROUGH the fallback path', async () => {
    const first = fail('deepinfra', 'no balance')
    const second = vi.fn<(system: string, user: string) => Promise<string>>(async () =>
      JSON.stringify({ prompt: '[[e1]] confronts a rival across a tense, rain-lit courtyard' }),
    )
    const svc = createPromptEnhanceService({
      deepinfraToken: null,
      groqApiKey: null,
      completers: [first, { id: 'groq', complete: second }],
    })
    const { prompt } = await svc.enhance({ text: '[[e1]] brutally beats a rival', mode: 'soften' })
    expect(prompt).toContain('[[e1]]')
    const [system, user] = second.mock.calls[0]!
    expect(system).toContain('[[eN]]')
    expect(user).toContain('[[e1]]')
  })

  it('falls through to the second provider when the first fails, returning the second result', async () => {
    const first = fail('deepinfra', 'no balance')
    const second = ok('groq', GOOD)
    const log = { warn: vi.fn() }
    const svc = createPromptEnhanceService({
      deepinfraToken: null,
      groqApiKey: null,
      completers: [first, second],
      log,
    })
    const { prompt } = await svc.enhance({ text: 'a cat on a wall', mode: 'enhance' })
    expect(prompt).toContain('lone fox')
    expect(first.complete).toHaveBeenCalledTimes(1)
    expect(second.complete).toHaveBeenCalledTimes(1)
    // The per-provider failure is logged for diagnosis (with the provider id).
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'prompt.provider_failed', provider: 'deepinfra' }),
      expect.any(String),
    )
  })

  it('falls through on a MALFORMED first answer, using the second provider', async () => {
    const first = ok('deepinfra', 'garbage not json')
    const second = ok('groq', GOOD)
    const svc = createPromptEnhanceService({
      deepinfraToken: null,
      groqApiKey: null,
      completers: [first, second],
    })
    const { prompt } = await svc.enhance({ text: 'a cat', mode: 'enhance' })
    expect(prompt).toContain('lone fox')
  })

  it('surfaces provider_error when ALL configured providers fail', async () => {
    const svc = createPromptEnhanceService({
      deepinfraToken: null,
      groqApiKey: null,
      completers: [fail('deepinfra'), fail('groq')],
    })
    await expect(svc.enhance({ text: 'a cat', mode: 'enhance' })).rejects.toBeInstanceOf(
      PromptEnhanceUnavailableError,
    )
  })

  it('surfaces provider_error when NOTHING is configured (empty chain)', async () => {
    const svc = createPromptEnhanceService({ deepinfraToken: null, groqApiKey: null })
    await expect(svc.enhance({ text: 'a cat', mode: 'enhance' })).rejects.toBeInstanceOf(
      PromptEnhanceUnavailableError,
    )
  })

  it('works with ONLY a Groq key set (DeepInfra absent), producing output end to end', async () => {
    // Real builder + real Groq adapter + mocked transport: proves the production
    // token→chain wiring yields output when DeepInfra is not configured.
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: GOOD } }] }), { status: 200 }),
    )
    const chain = buildEnhanceChain(null, 'gk', fetchMock)
    expect(chain.map((c) => c.id)).toEqual(['groq'])
    const svc = createPromptEnhanceService({
      deepinfraToken: null,
      groqApiKey: 'gk',
      completers: chain,
    })
    const { prompt } = await svc.enhance({ text: 'a cat on a wall', mode: 'enhance' })
    expect(prompt).toContain('lone fox')
  })
})

describe('POST /api/prompt/enhance', () => {
  it('requires a session (401 without a cookie)', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/prompt/enhance',
      payload: { text: 'a cat on a wall' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('rejects an empty text with a 400 validation_failed', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/prompt/enhance',
      headers: { cookie },
      payload: { text: '' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('validation_failed')
  })

  it('answers provider_error (502) when NO provider is configured — and charges nothing', async () => {
    const app = await buildTestApp() // deepinfraToken + groqApiKey both null by default
    const cookie = await registerAndGetCookie(app)
    const before = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
    const balanceBefore = before.json().creditsBalance

    const res = await app.inject({
      method: 'POST',
      url: '/api/prompt/enhance',
      headers: { cookie },
      payload: { text: 'a cat on a wall' },
    })
    expect(res.statusCode).toBe(502)
    expect(res.json().error.code).toBe('provider_error')

    // A prompt assist must never touch the credit ledger.
    const after = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
    expect(after.json().creditsBalance).toBe(balanceBefore)
  })
})
