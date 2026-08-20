// HTTP tests for openCreator (ADR opencreator-agent): the sessions API, the
// detached agent turn, and — the reason this suite exists — THE BUDGET GATE.
//
// The brain is INJECTED (`creatorBrains`), so every test scripts the LLM
// deterministically: no Anthropic key, no DeepInfra token, no network. The
// generation path underneath is the REAL one (fakeRunware + the real ledger), so
// "did the agent spend money" is answered by the same evidence a user's own
// generation would leave: a runware call and a balance change.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildTestApp, fakeRunware, registerAndGetCookie } from './helpers/build-test-app'
import { createDb } from '../src/db/client'
import { sanitizeAssistantText, settleStaleCreatorSessions } from '../src/modules/creator/service'
import type { Brain, BrainReply, BrainToolCall } from '../src/modules/creator/brain'

// The generation success path downloads the produced asset through global fetch.
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(Buffer.from('fake-bytes'), { status: 200 })),
  )
})
afterEach(() => vi.unstubAllGlobals())

let callSeq = 0
const call = (name: string, input: unknown): BrainToolCall => ({
  id: `tc${++callSeq}`,
  name,
  input,
})

// A brain that answers a fixed script, one reply per loop step. Anything past the
// script is a plain text answer, which ends the turn.
const scripted = (replies: BrainReply[]): Brain => {
  let index = 0
  return {
    id: 'anthropic',
    complete: async () => replies[index++] ?? { text: 'Готово.', toolCalls: [] },
  }
}

// A brain whose call never settles — the only deterministic way to observe a
// session that is genuinely still `running`.
const hangingBrain = (): Brain => ({
  id: 'anthropic',
  complete: () => new Promise(() => {}),
})

type Detail = {
  id: string
  title: string
  status: string
  messages: { role: string; content: Record<string, unknown> }[]
}

type App = Awaited<ReturnType<typeof buildTestApp>>

const open = async (app: App, cookie: string, message: string) => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/creator/sessions',
    headers: { cookie },
    payload: { message },
  })
  expect(res.statusCode).toBe(202)
  return res.json() as Detail
}

// The turn is DETACHED (202 + poll), so tests wait the way the SPA does.
const waitFor = async (
  app: App,
  cookie: string,
  id: string,
  statuses: string[],
): Promise<Detail> => {
  for (let attempt = 0; attempt < 200; attempt++) {
    const res = await app.inject({
      method: 'GET',
      url: `/api/creator/sessions/${id}`,
      headers: { cookie },
    })
    const detail = res.json() as Detail
    if (statuses.includes(detail.status)) return detail
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error(`session ${id} never reached ${statuses.join('|')}`)
}

const balanceOf = async (app: App, cookie: string): Promise<number> => {
  const res = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
  return (res.json() as { creditsBalance: number }).creditsBalance
}

const kinds = (detail: Detail) => detail.messages.map((m) => m.content.kind)

describe('creator sessions API', () => {
  it('requires a session on every route', async () => {
    const app = await buildTestApp()
    for (const [method, url] of [
      ['GET', '/api/creator/sessions'],
      ['POST', '/api/creator/sessions'],
      ['GET', '/api/creator/sessions/s1'],
      ['POST', '/api/creator/sessions/s1/messages'],
      ['POST', '/api/creator/sessions/s1/confirm'],
    ] as const) {
      const res = await app.inject({
        method,
        url,
        ...(method === 'POST' ? { payload: { message: 'сделай лиса' } } : {}),
      })
      expect(res.statusCode, `${method} ${url}`).toBe(401)
    }
  })

  it('opens a session with the first task and answers 202 with the transcript', async () => {
    const app = await buildTestApp({ creatorBrains: [scripted([{ text: 'Понял.', toolCalls: [] }])] })
    const cookie = await registerAndGetCookie(app)
    const detail = await open(app, cookie, 'сделай картинку лиса')
    expect(detail.title).toContain('сделай картинку лиса')
    expect(detail.messages[0]).toMatchObject({
      role: 'user',
      content: { kind: 'text', text: 'сделай картинку лиса' },
    })

    const settled = await waitFor(app, cookie, detail.id, ['idle'])
    expect(settled.messages.at(-1)).toMatchObject({
      role: 'assistant',
      content: { kind: 'text', text: 'Понял.' },
    })
  })

  it('rejects a too-short message', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/creator/sessions',
      headers: { cookie },
      payload: { message: 'a' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('validation_failed')
  })

  it('records each executed tool as a step card, then answers', async () => {
    const app = await buildTestApp({
      creatorBrains: [
        scripted([
          { toolCalls: [call('list_models', {})] },
          { text: 'Есть модели, предлагаю flux.', toolCalls: [] },
        ]),
      ],
    })
    const cookie = await registerAndGetCookie(app)
    const opened = await open(app, cookie, 'какие модели есть?')
    const settled = await waitFor(app, cookie, opened.id, ['idle'])
    expect(kinds(settled)).toEqual(['text', 'step', 'text'])
    expect(settled.messages[1]?.content).toMatchObject({ kind: 'step', tool: 'list_models', status: 'done' })
  })

  it('lists only the caller sessions and 404s a foreign one', async () => {
    const app = await buildTestApp({ creatorBrains: [scripted([{ text: 'ок', toolCalls: [] }])] })
    const mine = await registerAndGetCookie(app, 'mine@b.co')
    const other = await registerAndGetCookie(app, 'other@b.co')
    const opened = await open(app, mine, 'моя задача')
    await waitFor(app, mine, opened.id, ['idle'])

    const list = await app.inject({
      method: 'GET',
      url: '/api/creator/sessions',
      headers: { cookie: mine },
    })
    expect((list.json() as { items: unknown[] }).items).toHaveLength(1)
    const foreignList = await app.inject({
      method: 'GET',
      url: '/api/creator/sessions',
      headers: { cookie: other },
    })
    expect((foreignList.json() as { items: unknown[] }).items).toHaveLength(0)

    // A foreign id is indistinguishable from a missing one (films/canvas rule).
    const foreign = await app.inject({
      method: 'GET',
      url: `/api/creator/sessions/${opened.id}`,
      headers: { cookie: other },
    })
    expect(foreign.statusCode).toBe(404)
  })

  it('409s a second turn while one is running, and 409s a pointless confirm', async () => {
    const app = await buildTestApp({ creatorBrains: [hangingBrain()] })
    const cookie = await registerAndGetCookie(app)
    const opened = await open(app, cookie, 'бесконечная задача')

    const second = await app.inject({
      method: 'POST',
      url: `/api/creator/sessions/${opened.id}/messages`,
      headers: { cookie },
      payload: { message: 'и ещё одно' },
    })
    expect(second.statusCode).toBe(409)
    expect(second.json().error.code).toBe('conflict')

    // Nothing to confirm: the agent never proposed a plan.
    const confirm = await app.inject({
      method: 'POST',
      url: `/api/creator/sessions/${opened.id}/confirm`,
      headers: { cookie },
    })
    expect(confirm.statusCode).toBe(409)
  })

  it('fails the turn with a SANITIZED message when no brain is configured', async () => {
    // Neither key set → an empty chain → CreatorUnavailableError. The chat must
    // say something honest and name no provider.
    const app = await buildTestApp({ creatorBrains: [] })
    const cookie = await registerAndGetCookie(app)
    const opened = await open(app, cookie, 'сделай лиса')
    const failed = await waitFor(app, cookie, opened.id, ['failed'])
    const last = failed.messages.at(-1)?.content as { kind: string; text: string }
    expect(last.kind).toBe('text')
    expect(last.text).toMatch(/agent/i)
    expect(last.text).not.toMatch(/anthropic|deepinfra|HTTP/i)
  })
})

describe('THE BUDGET GATE over HTTP', () => {
  const IMAGE_CALL = {
    modelId: 'flux-schnell',
    prompt: 'a red fox in the snow',
    aspectRatio: '1:1',
  }

  it('refuses generation before confirm: no provider call, balance untouched', async () => {
    const rw = fakeRunware()
    rw.imageInference.mockResolvedValue({ imageURL: 'https://im.runware.ai/a.webp', seed: 1 })
    const app = await buildTestApp({
      runware: rw,
      creatorBrains: [
        scripted([
          // A model that tries to spend straight away — the case the gate exists for.
          { toolCalls: [call('start_generation', IMAGE_CALL)] },
          {
            toolCalls: [
              call('propose_plan', {
                summary: '1 картинка на Flux Schnell',
                items: [{ label: 'Кадр 1 — Flux Schnell', credits: 1 }],
                totalCredits: 1,
              }),
            ],
          },
        ]),
      ],
    })
    const cookie = await registerAndGetCookie(app)
    const before = await balanceOf(app, cookie)

    const opened = await open(app, cookie, 'сделай картинку лиса')
    const awaiting = await waitFor(app, cookie, opened.id, ['awaiting_confirm'])

    // The refusal is a visible ERROR step, and the plan card follows it.
    expect(kinds(awaiting)).toEqual(['text', 'step', 'plan'])
    expect(awaiting.messages[1]?.content).toMatchObject({
      kind: 'step',
      tool: 'start_generation',
      status: 'error',
    })
    expect(awaiting.messages[2]?.content).toMatchObject({ kind: 'plan', totalCredits: 1 })
    // THE assertions: nothing was submitted and nothing was charged.
    expect(rw.imageInference).not.toHaveBeenCalled()
    expect(await balanceOf(app, cookie)).toBe(before)
  })

  it('runs and CHARGES the plan after confirm', async () => {
    const rw = fakeRunware()
    rw.imageInference.mockResolvedValue({ imageURL: 'https://im.runware.ai/a.webp', seed: 1 })
    const app = await buildTestApp({
      runware: rw,
      creatorBrains: [
        scripted([
          {
            toolCalls: [
              call('propose_plan', {
                summary: '1 картинка',
                items: [{ label: 'Кадр 1', credits: 1 }],
                totalCredits: 1,
              }),
            ],
          },
          // Post-confirm turn: now the same call is allowed.
          { toolCalls: [call('start_generation', IMAGE_CALL)] },
          { text: 'Кадр готов.', toolCalls: [] },
        ]),
      ],
    })
    const cookie = await registerAndGetCookie(app)
    const before = await balanceOf(app, cookie)
    const opened = await open(app, cookie, 'сделай картинку лиса')
    await waitFor(app, cookie, opened.id, ['awaiting_confirm'])

    const confirmed = await app.inject({
      method: 'POST',
      url: `/api/creator/sessions/${opened.id}/confirm`,
      headers: { cookie },
    })
    expect(confirmed.statusCode).toBe(202)

    const done = await waitFor(app, cookie, opened.id, ['idle'])
    expect(rw.imageInference).toHaveBeenCalledOnce()
    expect(await balanceOf(app, cookie)).toBe(before - 7)
    const step = done.messages.find(
      (m) => (m.content as { tool?: string }).tool === 'start_generation',
    )
    expect(step?.content).toMatchObject({ kind: 'step', status: 'done', costCredits: 7 })
    expect((step?.content as { generationId?: string }).generationId).toBeTruthy()
  })

  it('a NEW user message revokes the confirmation (one confirm buys one plan)', async () => {
    // The gate would otherwise leak: a session confirmed for plan A would let the
    // agent spend on an unrelated follow-up task without asking again.
    const rw = fakeRunware()
    rw.imageInference.mockResolvedValue({ imageURL: 'https://im.runware.ai/a.webp', seed: 1 })
    const app = await buildTestApp({
      runware: rw,
      creatorBrains: [
        scripted([
          {
            toolCalls: [
              call('propose_plan', {
                summary: '1 картинка',
                items: [{ label: 'Кадр 1', credits: 1 }],
                totalCredits: 1,
              }),
            ],
          },
          { toolCalls: [call('start_generation', IMAGE_CALL)] },
          { text: 'Кадр готов.', toolCalls: [] },
          // The follow-up turn tries to spend again with no new plan.
          { toolCalls: [call('start_generation', IMAGE_CALL)] },
          { text: 'Не получилось.', toolCalls: [] },
        ]),
      ],
    })
    const cookie = await registerAndGetCookie(app)
    const opened = await open(app, cookie, 'сделай картинку лиса')
    await waitFor(app, cookie, opened.id, ['awaiting_confirm'])
    await app.inject({
      method: 'POST',
      url: `/api/creator/sessions/${opened.id}/confirm`,
      headers: { cookie },
    })
    await waitFor(app, cookie, opened.id, ['idle'])
    const afterFirst = await balanceOf(app, cookie)

    const followUp = await app.inject({
      method: 'POST',
      url: `/api/creator/sessions/${opened.id}/messages`,
      headers: { cookie },
      payload: { message: 'сделай ещё одну' },
    })
    expect(followUp.statusCode).toBe(202)
    const settled = await waitFor(app, cookie, opened.id, ['idle', 'awaiting_confirm', 'failed'])

    // Exactly ONE charge in the whole session, and the second attempt is refused.
    expect(rw.imageInference).toHaveBeenCalledOnce()
    expect(await balanceOf(app, cookie)).toBe(afterFirst)
    const refusals = settled.messages.filter(
      (m) =>
        (m.content as { tool?: string }).tool === 'start_generation' &&
        (m.content as { status?: string }).status === 'error',
    )
    expect(refusals).toHaveLength(1)
  })
})

describe('settleStaleCreatorSessions', () => {
  it('fails a running session left behind by a restart and tells the user', async () => {
    // In-flight turns live in process memory (the DeepInfra-job precedent), so a
    // restart leaves `running` rows that nothing else can settle.
    const db = createDb(':memory:').db
    const app = await buildTestApp({ db, creatorBrains: [hangingBrain()] })
    const cookie = await registerAndGetCookie(app)
    const opened = await open(app, cookie, 'зависшая задача')

    settleStaleCreatorSessions(db, Date.now() + 11 * 60 * 1000)

    const res = await app.inject({
      method: 'GET',
      url: `/api/creator/sessions/${opened.id}`,
      headers: { cookie },
    })
    const detail = res.json() as Detail
    expect(detail.status).toBe('failed')
    expect(detail.messages.at(-1)?.content.kind).toBe('text')
  })

  it('leaves a fresh running session alone', async () => {
    const db = createDb(':memory:').db
    const app = await buildTestApp({ db, creatorBrains: [hangingBrain()] })
    const cookie = await registerAndGetCookie(app)
    const opened = await open(app, cookie, 'свежая задача')

    settleStaleCreatorSessions(db, Date.now())

    const res = await app.inject({
      method: 'GET',
      url: `/api/creator/sessions/${opened.id}`,
      headers: { cookie },
    })
    expect((res.json() as Detail).status).toBe('running')
  })
})

// Degenerate-reply guard (seen live 2026-07-30: DeepSeek looped «of the 1
// image of the …» for 4000 chars instead of calling a tool). The guard is
// shape-based — tiny vocabulary at abnormal length — so real prose passes.
describe('sanitizeAssistantText', () => {
  it('passes normal prose through, trimmed', () => {
    expect(sanitizeAssistantText('  Готово: холст создан, картинка на месте.  ')).toBe(
      'Готово: холст создан, картинка на месте.',
    )
  })
  it('maps empty/undefined to the quiet default', () => {
    expect(sanitizeAssistantText(undefined)).toBe('Готово.')
    expect(sanitizeAssistantText('   ')).toBe('Готово.')
  })
  it('replaces a long low-vocabulary loop with the sanitized failure literal', () => {
    const loop = 'of the 1 image '.repeat(300)
    expect(sanitizeAssistantText(loop)).toBe('The agent turn failed')
  })
  it('keeps long REAL prose (vocabulary stays rich)', () => {
    const words = Array.from({ length: 300 }, (_, i) => `слово${i}`).join(' ')
    expect(sanitizeAssistantText(words)).toBe(words)
  })
})
