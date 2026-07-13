// ByteDance ModelArk adapter tests (ADR: seedance-direct-bytedance). The
// adapter implements the neutral VideoProvider against ByteDance's DIRECT API
// (no Runware in the path): submit POSTs a task to /api/v3/contents/generations
// /tasks and returns the `cgt-…` id; poll GETs the task and maps ModelArk's
// six-state status enum onto the three-state neutral union.
//
// The assertions here are not stylistic — each one pins a fact from the ModelArk
// docs that, if violated, breaks the integration in a way unit-invisible to us:
// the mandatory `dreamina-` model prefix, the four params Seedance 2.0 REJECTS,
// generate_audio defaulting to true on their side, and the real-person input
// moderation code that must surface as a refundable content_blocked.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ArkError, createArkClient } from '../src/integrations/bytedance/ark-client'

afterEach(() => vi.unstubAllGlobals())

const KEY = 'ark-test-key'
const MODEL = 'bytedance:dreamina-seedance-2-0-260128'
const TASKS_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks'

function stubFetch(status: number, body: unknown) {
  const fn = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', fn)
  return fn
}

type SentBody = {
  model: string
  content: Array<Record<string, unknown>>
  resolution?: string
  ratio?: string
  duration?: number
  watermark?: boolean
  generate_audio?: boolean
  seed?: number
  camera_fixed?: boolean
  frames?: number
  service_tier?: string
}
const parseSent = (init: RequestInit): SentBody => JSON.parse(String(init.body)) as SentBody

const t2v = {
  prompt: 'a red fox running through snow',
  width: 1280,
  height: 720,
  durationSeconds: 5,
  model: MODEL,
}

describe('ark client — submit', () => {
  it('throws a clean provider_error (no fetch) when ARK_API_KEY is unset', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const client = createArkClient({ apiKey: null })
    const err = await client.submit(t2v).catch((e) => e)
    expect(err).toBeInstanceOf(ArkError)
    expect(err.apiCode).toBe('provider_error')
    expect(err.statusCode).toBe(502)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('POSTs a text-to-video task with bearer auth and returns the cgt- task id', async () => {
    const fn = stubFetch(200, { id: 'cgt-2026-abc' })
    const client = createArkClient({ apiKey: KEY })

    const { providerJobId } = await client.submit(t2v)

    expect(providerJobId).toBe('cgt-2026-abc')
    const [url, init] = fn.mock.calls[0]!
    expect(url).toBe(TASKS_URL)
    expect(init!.method).toBe('POST')
    const headers = init!.headers as Record<string, string>
    expect(headers.Authorization).toBe(`Bearer ${KEY}`)
    expect(headers['Content-Type']).toBe('application/json')
  })

  it('strips the synthetic bytedance: prefix off the AIR id and sends the real ModelArk model id', async () => {
    // The catalog `air` must satisfy the provider:model AIR regex, but ModelArk
    // wants the bare id — AND it must keep the `dreamina-` prefix, without which
    // the API 404s with InvalidEndpointOrModel.NotFound.
    const fn = stubFetch(200, { id: 'cgt-1' })
    await createArkClient({ apiKey: KEY }).submit(t2v)
    expect(parseSent(fn.mock.calls[0]![1]!).model).toBe('dreamina-seedance-2-0-260128')
  })

  it('derives resolution + ratio from the neutral width/height and sends the prompt in content[]', async () => {
    const fn = stubFetch(200, { id: 'cgt-1' })
    await createArkClient({ apiKey: KEY }).submit(t2v)
    const sent = parseSent(fn.mock.calls[0]![1]!)
    expect(sent.resolution).toBe('720p')
    expect(sent.ratio).toBe('16:9')
    expect(sent.duration).toBe(5)
    expect(sent.content).toEqual([{ type: 'text', text: 'a red fox running through snow' }])
  })

  it('maps every aspect the catalog offers onto a ModelArk ratio (720p ⇒ our hd table exactly)', async () => {
    const cases = [
      { width: 1280, height: 720, ratio: '16:9' },
      { width: 960, height: 960, ratio: '1:1' },
      { width: 720, height: 1280, ratio: '9:16' },
    ]
    for (const c of cases) {
      const fn = stubFetch(200, { id: 'cgt-1' })
      await createArkClient({ apiKey: KEY }).submit({ ...t2v, width: c.width, height: c.height })
      const sent = parseSent(fn.mock.calls[0]![1]!)
      expect(sent.ratio).toBe(c.ratio)
      expect(sent.resolution).toBe('720p')
      vi.unstubAllGlobals()
    }
  })

  it('NEVER sends the four params Seedance 2.0 rejects, and pins watermark/audio explicitly', async () => {
    // seed / camera_fixed / frames / service_tier are documented as unsupported by
    // the 2.0 series and ERROR under the strict (non-legacy) parameter method —
    // so a caller-supplied seed must be dropped, not forwarded.
    const fn = stubFetch(200, { id: 'cgt-1' })
    await createArkClient({ apiKey: KEY }).submit({ ...t2v, seed: 42 })
    const sent = parseSent(fn.mock.calls[0]![1]!)
    expect(sent).not.toHaveProperty('seed')
    expect(sent).not.toHaveProperty('camera_fixed')
    expect(sent).not.toHaveProperty('frames')
    expect(sent).not.toHaveProperty('service_tier')
    // generate_audio DEFAULTS TO TRUE on ByteDance's side: left implicit we would
    // ship (and pay for) a soundtrack the timeline never asked for, colliding with
    // CinemaStudio's own audio tracks at render. Pin it off, explicitly.
    expect(sent.generate_audio).toBe(false)
    expect(sent.watermark).toBe(false)
  })

  it('sends an image→video seed frame as a content[] image_url data URI', async () => {
    const fn = stubFetch(200, { id: 'cgt-1' })
    await createArkClient({ apiKey: KEY }).submit({
      ...t2v,
      inputImage: 'data:image/png;base64,AAAA',
    })
    const sent = parseSent(fn.mock.calls[0]![1]!)
    expect(sent.content).toEqual([
      { type: 'text', text: t2v.prompt },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
    ])
  })

  it('surfaces a real-person input rejection as a REFUNDABLE content_blocked, not a generic 502', async () => {
    // The headline Seedance 2.0 constraint: the 2.0 series refuses any uploaded
    // image containing a real human face. A user animating a portrait must get a
    // truthful "this model will not accept real faces" + their credits back —
    // never an opaque provider error.
    stubFetch(400, {
      error: {
        code: 'InputImageSensitiveContentDetected.PrivacyInformation',
        message: 'The request failed because the input image may contain a real person.',
      },
    })
    const err = await createArkClient({ apiKey: KEY })
      .submit({ ...t2v, inputImage: 'data:image/png;base64,AAAA' })
      .catch((e) => e)
    expect(err).toBeInstanceOf(ArkError)
    expect(err.apiCode).toBe('content_blocked')
    expect(err.statusCode).toBe(400)
  })

  it('maps a sensitive-prompt rejection to content_blocked too', async () => {
    stubFetch(400, {
      error: { code: 'InputTextSensitiveContentDetected', message: 'sensitive input text' },
    })
    const err = await createArkClient({ apiKey: KEY }).submit(t2v).catch((e) => e)
    expect(err.apiCode).toBe('content_blocked')
  })

  it('maps a non-moderation HTTP failure to a sanitized provider_error', async () => {
    // ModelNotOpen is the classic first-integration 404 (model not activated on
    // the account) — it must not leak the raw body, but must stay a 502 so the
    // service refunds and the row is retriable rather than user-blamed.
    stubFetch(404, { error: { code: 'ModelNotOpen', message: 'model not activated' } })
    const err = await createArkClient({ apiKey: KEY }).submit(t2v).catch((e) => e)
    expect(err).toBeInstanceOf(ArkError)
    expect(err.apiCode).toBe('provider_error')
    expect(err.statusCode).toBe(502)
  })

  it('keeps the client message free of the provider body but carries it for the log', async () => {
    // The real body names our BytePlus ACCOUNT ID ("Your account 3003474417 has
    // not activated the model…"). app.ts serializes `message` to the browser
    // verbatim for any apiCode-carrying error, so the account id must never live
    // there. It rides on `providerDetail`, which only the error handler logs —
    // without it a 502 reaches an operator as an untraceable "ModelArk HTTP 404".
    stubFetch(404, {
      error: {
        code: 'ModelNotOpen',
        message: 'Your account 3003474417 has not activated the model dreamina-seedance-2-0-260128.',
      },
    })
    const err = await createArkClient({ apiKey: KEY }).submit(t2v).catch((e) => e)
    expect(err.message).toBe('ModelArk HTTP 404')
    expect(err.message).not.toContain('3003474417')
    expect(err.providerDetail).toContain('ModelNotOpen')
    expect(err.providerDetail).toContain('3003474417')
  })

  it('throws provider_error when the API returns no task id', async () => {
    stubFetch(200, { not_an_id: true })
    const err = await createArkClient({ apiKey: KEY }).submit(t2v).catch((e) => e)
    expect(err).toBeInstanceOf(ArkError)
    expect(err.apiCode).toBe('provider_error')
  })
})

describe('ark client — poll', () => {
  const poll = (body: unknown, status = 200) => {
    stubFetch(status, body)
    return createArkClient({ apiKey: KEY }).poll('cgt-1')
  }

  it('GETs the task by id', async () => {
    const fn = stubFetch(200, { id: 'cgt-1', status: 'queued' })
    await createArkClient({ apiKey: KEY }).poll('cgt-1')
    expect(fn.mock.calls[0]![0]).toBe(`${TASKS_URL}/cgt-1`)
  })

  it('maps queued and running to processing (ModelArk exposes no progress %)', async () => {
    expect(await poll({ status: 'queued' })).toEqual({ status: 'processing', progress: null })
    vi.unstubAllGlobals()
    expect(await poll({ status: 'running' })).toEqual({ status: 'processing', progress: null })
  })

  it('maps succeeded to success with the video_url and a cost derived from usage tokens', async () => {
    const r = await poll({
      id: 'cgt-1',
      status: 'succeeded',
      content: {
        video_url:
          'https://ark-content-generation-ap-southeast-1.tos-ap-southeast-1.volces.com/x.mp4',
      },
      usage: { completion_tokens: 108_000, total_tokens: 108_000 },
      resolution: '720p',
    })
    expect(r.status).toBe('success')
    if (r.status !== 'success') throw new Error('unreachable')
    expect(r.assetUrl).toMatch(/tos-ap-southeast-1\.volces\.com/)
    // 108k tokens × $0.0070/1k (the NO-video-input 720p rate) = $0.756.
    expect(r.costUsd).toBeCloseTo(0.756, 3)
    // ByteDance moderates its own output and fails the task instead of flagging
    // it, so a succeeded task is by definition not NSFW.
    expect(r.nsfw).toBe(false)
  })

  it('prices 1080p off its own (higher) no-video-input rate', async () => {
    const r = await poll({
      status: 'succeeded',
      content: { video_url: 'https://x.tos-ap-southeast-1.volces.com/x.mp4' },
      usage: { total_tokens: 243_000 },
      resolution: '1080p',
    })
    if (r.status !== 'success') throw new Error('unreachable')
    // 243k × $0.0077/1k = $1.8711
    expect(r.costUsd).toBeCloseTo(1.871, 3)
  })

  it('maps failed to the neutral error state with the provider message', async () => {
    const r = await poll({
      status: 'failed',
      error: { code: 'InternalServiceError', message: 'model worker crashed' },
    })
    expect(r).toEqual({ status: 'error', message: 'model worker crashed' })
  })

  it('flags an OUTPUT moderation failure as blocked so the service refunds as content_blocked', async () => {
    const r = await poll({
      status: 'failed',
      error: {
        code: 'OutputVideoSensitiveContentDetected',
        message: 'The generated video may contain sensitive information.',
      },
    })
    expect(r.status).toBe('error')
    if (r.status !== 'error') throw new Error('unreachable')
    expect(r.blocked).toBe(true)
  })

  it('treats cancelled and expired as terminal errors (never a stuck processing row)', async () => {
    expect((await poll({ status: 'cancelled' })).status).toBe('error')
    vi.unstubAllGlobals()
    expect((await poll({ status: 'expired' })).status).toBe('error')
  })

  it('returns success-with-no-asset when succeeded carries no video_url (service refunds)', async () => {
    const r = await poll({ status: 'succeeded', content: {}, usage: { total_tokens: 1 } })
    expect(r.status).toBe('success')
    if (r.status !== 'success') throw new Error('unreachable')
    expect(r.assetUrl).toBeUndefined()
  })

  it('maps an unknown status to processing rather than inventing a terminal state', async () => {
    expect(await poll({ status: 'something_new' })).toEqual({ status: 'processing', progress: null })
  })

  it('throws a sanitized ArkError on a transport failure (row stays processing, poll retries)', async () => {
    const err = await poll({}, 500).catch((e) => e)
    expect(err).toBeInstanceOf(ArkError)
    expect(err.apiCode).toBe('provider_error')
  })
})
