// apps/api/test/kie-image.test.ts
// Seedream 5 on kie.ai — the backend every image now runs on — plus the failover
// chain that stands Runware behind it. Pinned in DESCENDING order of what each
// mistake costs, the same way the video adapter's tests are:
//
//   1. THE SUBMIT BODY IS A BILL. quality is what picks 2K/3K/4K, and defaulting
//      it wrong buys the dear tier for a draft. aspect_ratio is an enum, not a
//      pixel pair; sending pixels would 400 after the charge.
//   2. A NEGATIVE PROMPT MUST NOT VANISH. Seedream has no negative channel, so
//      the preset's negative is folded into the prompt. Dropping it silently is
//      how a style preset stops working with nobody noticing.
//   3. A REFERENCE WITHOUT A PUBLIC URL MUST REFUSE THE JOB. Their schema takes
//      URLs only; sending nothing instead would render a beautiful picture of the
//      wrong subject and bill us for it. Refusing at SUBMIT is what lets the
//      chain run it on Runware (which takes data URIs) instead.
//   4. FAIL OVER AT SUBMIT ONLY, AND NEVER ON A CONTENT REFUSAL. Both are money
//      rules: the first stops us paying two vendors for one image, the second
//      stops us paying the whole chain to hear the same "no".
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createKieImageClient } from '../src/integrations/kie/kie-image'
import {
  createImageFailoverProvider,
  decodeImageJobId,
} from '../src/integrations/failover-image-provider'
import type { ImageProvider, ImageSubmitInput } from '../src/integrations/image-provider'

const KEY = 'kie-test-key'

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

function stubFetch(status: number, body: unknown) {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  )
}

const input: ImageSubmitInput = {
  prompt: 'a fox in the snow',
  models: { kie: 'seedream/5-lite-text-to-image', runware: 'runware:100@1' },
  width: 1376,
  height: 768,
  aspectRatio: '16:9',
  quality: 'high',
}

const bodyOf = (call: number = 0) =>
  JSON.parse(fetchMock.mock.calls[call]![1].body as string) as {
    model: string
    input: Record<string, unknown>
  }

describe('kie image adapter — the submit body', () => {
  it('sends the model, the ratio ENUM and the quality tier that prices the image', async () => {
    stubFetch(200, { code: 200, data: { taskId: 'task-1' } })
    const res = await createKieImageClient({ apiKey: KEY }).submit(input)

    expect(res).toEqual({ kind: 'pending', providerJobId: 'task-1' })
    const body = bodyOf()
    expect(body.model).toBe('seedream/5-lite-text-to-image')
    expect(body.input.aspect_ratio).toBe('16:9')
    expect(body.input.quality).toBe('high')
    // png, because these images are re-encoded downstream and jpeg artefacts
    // compound each time. Echoed into the stored extension on the poll side.
    expect(body.input.output_format).toBe('png')
    // Pixels are OURS, not theirs — sending width/height would be a parameter
    // their schema does not have.
    expect(body.input).not.toHaveProperty('width')
  })

  it("defaults quality to the CHEAP tier when the catalogue entry names none", async () => {
    stubFetch(200, { code: 200, data: { taskId: 't' } })
    const { prompt, models, width, height, aspectRatio } = input
    await createKieImageClient({ apiKey: KEY }).submit({
      prompt,
      models,
      width,
      height,
      aspectRatio,
    })
    // Being wrong toward 'basic' costs a smaller image; being wrong toward
    // 'ultra' silently buys 4K on every draft.
    expect(bodyOf().input.quality).toBe('basic')
  })

  it('folds the preset negative into the prompt instead of dropping it', async () => {
    stubFetch(200, { code: 200, data: { taskId: 't' } })
    await createKieImageClient({ apiKey: KEY }).submit({
      ...input,
      negativePrompt: 'cartoon, anime, low quality',
    })
    expect(bodyOf().input.prompt).toBe('a fox in the snow. Avoid: cartoon, anime, low quality')
  })

  it('keeps the POSITIVE prompt when folding would breach their 3000-char limit', async () => {
    stubFetch(200, { code: 200, data: { taskId: 't' } })
    const long = 'x'.repeat(2990)
    await createKieImageClient({ apiKey: KEY }).submit({
      ...input,
      prompt: long,
      negativePrompt: 'y'.repeat(100),
    })
    // What the user asked for survives; the avoidance clause is what gives way.
    expect(bodyOf().input.prompt).toBe(long)
  })

  it('refuses an over-long prompt BEFORE the HTTP call, so the chain can still route it', async () => {
    const client = createKieImageClient({ apiKey: KEY })
    await expect(client.submit({ ...input, prompt: 'x'.repeat(3001) })).rejects.toThrow(
      /3000 characters/,
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('kie image adapter — references are URLs, never bytes', () => {
  it('sends image_urls when every reference has a public URL', async () => {
    stubFetch(200, { code: 200, data: { taskId: 't' } })
    await createKieImageClient({ apiKey: KEY }).submit({
      ...input,
      referenceImages: [
        { dataUri: 'data:image/png;base64,AAA', publicUrl: 'https://app.example.com/media/a.png' },
      ],
    })
    expect(bodyOf().input.image_urls).toEqual(['https://app.example.com/media/a.png'])
  })

  it('REFUSES the job when a reference has no public URL (local dev)', async () => {
    const client = createKieImageClient({ apiKey: KEY })
    await expect(
      client.submit({
        ...input,
        referenceImages: [{ dataUri: 'data:image/png;base64,AAA', publicUrl: null }],
      }),
    ).rejects.toThrow(/publicly reachable/)
    // Never sent: a job that silently loses its reference produces a plausible
    // picture of a stranger, at full price.
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('kie image adapter — their envelope', () => {
  it('maps an insufficient-balance refusal to the code the money path keys off', async () => {
    // HTTP 200 with a non-200 envelope code is how ALL their business failures
    // arrive — the status line says success while the account is empty.
    stubFetch(200, { code: 402, msg: 'insufficient credits' })
    await expect(createKieImageClient({ apiKey: KEY }).submit(input)).rejects.toMatchObject({
      apiCode: 'insufficient_credits',
    })
  })

  it('reports success with the asset, the cost and the stored extension', async () => {
    stubFetch(200, {
      code: 200,
      data: {
        state: 'success',
        resultJson: JSON.stringify({ resultUrls: ['https://cdn.kie/x.png'] }),
        creditsConsumed: 7,
      },
    })
    const res = await createKieImageClient({ apiKey: KEY }).poll('t')
    expect(res).toMatchObject({
      status: 'success',
      assetUrl: 'https://cdn.kie/x.png',
      // 7 credits at their $0.005 rate.
      costUsd: 0.035,
      ext: 'png',
    })
  })

  it('treats success-with-no-asset as a failure rather than an empty success', async () => {
    stubFetch(200, { code: 200, data: { state: 'success', resultJson: 'not json' } })
    expect(await createKieImageClient({ apiKey: KEY }).poll('t')).toMatchObject({ status: 'error' })
  })

  it('marks a moderation failure as blocked, so the user is told WHY', async () => {
    stubFetch(200, { code: 200, data: { state: 'fail', failCode: '500', failMsg: 'nsfw content' } })
    expect(await createKieImageClient({ apiKey: KEY }).poll('t')).toMatchObject({
      status: 'error',
      blocked: true,
      code: 'content_blocked',
    })
    // Their words never reach the browser — only our category does.
    const res = await createKieImageClient({ apiKey: KEY }).poll('t')
    expect(res.status === 'error' && res.message).not.toContain('nsfw content')
  })

  it('answers a transient status-call failure as processing, never as an error', async () => {
    // An 'error' here would refund a job that then succeeds and bills us anyway.
    fetchMock.mockRejectedValue(new Error('ECONNRESET'))
    expect(await createKieImageClient({ apiKey: KEY }).poll('t')).toEqual({ status: 'processing' })
  })

  it('treats an unknown/absent state as processing (their API returns none briefly)', async () => {
    stubFetch(200, { code: 200, data: {} })
    expect(await createKieImageClient({ apiKey: KEY }).poll('t')).toEqual({ status: 'processing' })
  })
})

// ── The chain ───────────────────────────────────────────────────────────────
const fake = (over: Partial<ImageProvider> = {}): ImageProvider => ({
  submit: vi.fn(async () => ({ kind: 'pending' as const, providerJobId: 'inner' })),
  poll: vi.fn(async () => ({ status: 'processing' as const })),
  ...over,
})

describe('image failover chain', () => {
  it('encodes the winning link into the job id, so a poll after a restart finds it', async () => {
    const kie = fake()
    const chain = createImageFailoverProvider([
      { id: 'kie', provider: kie },
      { id: 'runware', provider: fake() },
    ])
    const res = await chain.submit(input)
    expect(res).toEqual({ kind: 'pending', providerJobId: 'kie#inner' })
    expect(decodeImageJobId('kie#inner')).toEqual({ linkId: 'kie', innerId: 'inner' })
  })

  it('returns a SYNCHRONOUS result untouched — there is no job id to encode', async () => {
    const done = { kind: 'done' as const, assetUrl: 'https://x/y.webp', ext: 'webp' as const }
    const chain = createImageFailoverProvider([
      { id: 'runware', provider: fake({ submit: vi.fn(async () => done) }) },
    ])
    expect(await chain.submit(input)).toEqual(done)
  })

  it('falls over at submit and reports it, so a dead provider cannot hide', async () => {
    const dead = fake({ submit: vi.fn(async () => { throw new Error('kie is down') }) })
    const alive = fake()
    const onFailover = vi.fn()
    const chain = createImageFailoverProvider(
      [
        { id: 'kie', provider: dead },
        { id: 'runware', provider: alive },
      ],
      { onFailover },
    )
    expect(await chain.submit(input)).toEqual({ kind: 'pending', providerJobId: 'runware#inner' })
    expect(onFailover).toHaveBeenCalledWith({ from: 'kie', to: 'runware', reason: 'kie is down' })
  })

  it('NEVER walks the chain on a content refusal', async () => {
    const refuses = fake({
      submit: vi.fn(async () => {
        throw Object.assign(new Error('refused'), { apiCode: 'content_blocked' })
      }),
    })
    const next = fake()
    const chain = createImageFailoverProvider([
      { id: 'kie', provider: refuses },
      { id: 'runware', provider: next },
    ])
    await expect(chain.submit(input)).rejects.toThrow('refused')
    // The same model at another reseller says the same no — walking on would
    // spend the whole chain to hear it twice.
    expect(next.submit).not.toHaveBeenCalled()
  })

  it('skips a link that has no handle for this model, without a failed call', async () => {
    const kie = fake()
    const runware = fake()
    const chain = createImageFailoverProvider([
      { id: 'kie', provider: kie },
      { id: 'runware', provider: runware },
    ])
    await chain.submit({ ...input, models: { runware: 'runware:100@1' } })
    // A Runware-only entry must cost ZERO kie calls, not one that fails.
    expect(kie.submit).not.toHaveBeenCalled()
    expect(runware.submit).toHaveBeenCalled()
  })

  it('settles a job whose link no longer exists instead of polling forever', async () => {
    const chain = createImageFailoverProvider([{ id: 'runware', provider: fake() }])
    // Credits held by an unanswerable row would sit until the stale reaper.
    expect(await chain.poll('kie#gone')).toMatchObject({ status: 'error' })
  })

  it('polls a PREFIXLESS id on the first link — rows written before the chain shipped', async () => {
    const first = fake()
    const chain = createImageFailoverProvider([
      { id: 'kie', provider: first },
      { id: 'runware', provider: fake() },
    ])
    await chain.poll('bare-task-id')
    expect(first.poll).toHaveBeenCalledWith('bare-task-id')
  })
})
