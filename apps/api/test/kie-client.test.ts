// apps/api/test/kie-client.test.ts
// The kie.ai VideoProvider (Seedance 1.5 Pro reseller) had ZERO test coverage:
// compare-video.test.ts sets a kieApiKey but always overrides the channel with a
// scripted fake, so createKieClient's real submit/poll never ran anywhere. These
// tests pin the wire contract in DESCENDING order of what it costs to get wrong:
//
//   1. resolution is derived from the SHORT edge — the long edge would read every
//      portrait clip as 1080p and buy it at more than twice the price.
//   2. HTTP 200 can still be a business failure (their own envelope `code`); an
//      insufficient-credits refusal must map to the SAME apiCode the money path
//      already keys refunds off, not a generic provider_error.
//   3. resultJson is a JSON STRING nested inside JSON — malformed/empty must not
//      invent a URL (the service treats success-with-no-asset as a failure+refund).
//   4. a transient status-call failure must settle as 'processing', never 'error'
//      (an 'error' here would refund a job that then succeeds and bills us anyway).
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  KieError,
  KIE_CREDIT_USD,
  createKieClient,
  firstResultUrl,
  resolutionFor,
  toKieModelId,
} from '../src/integrations/kie/kie-video'

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

const submitInput = {
  prompt: 'a fox in the snow',
  width: 1280,
  height: 720,
  durationSeconds: 5,
  model: 'kie:bytedance/seedance-1.5-pro',
}

function sentBody() {
  const init = fetchMock.mock.calls[0]![1] as RequestInit
  return JSON.parse(init.body as string) as {
    model: string
    input: Record<string, unknown>
  }
}

describe('kie — pure mapping', () => {
  it('strips the synthetic kie: provider prefix, leaving their model id untouched', () => {
    expect(toKieModelId('kie:bytedance/seedance-1.5-pro')).toBe('bytedance/seedance-1.5-pro')
    expect(toKieModelId('bytedance/seedance-1.5-pro')).toBe('bytedance/seedance-1.5-pro')
  })

  // THE MONEY TEST. The short edge names the tier: 720p portrait is 720×1280, so
  // reading the long edge would bill a 720p clip at the 1080p rate.
  it('derives the resolution tier from the short edge, both orientations', () => {
    expect(resolutionFor(1280, 720)).toBe('720p')
    expect(resolutionFor(720, 1280)).toBe('720p')
    expect(resolutionFor(1920, 1080)).toBe('1080p')
    expect(resolutionFor(1080, 1920)).toBe('1080p')
    expect(resolutionFor(854, 480)).toBe('480p')
  })

  describe('firstResultUrl', () => {
    it('parses the nested JSON string and returns the first url', () => {
      expect(firstResultUrl('{"resultUrls":["https://tempfile.aiquickdraw.com/a.mp4"]}')).toBe(
        'https://tempfile.aiquickdraw.com/a.mp4',
      )
    })
    it.each([undefined, null, '', '{}', '{"resultUrls":[]}', 'not json', '{"resultUrls":[123]}'])(
      'returns undefined rather than inventing a url for %p',
      (input) => {
        expect(firstResultUrl(input as string | null | undefined)).toBeUndefined()
      },
    )
  })
})

describe('kie — submit', () => {
  it('throws a clean provider_error (no fetch) when the key is unset', async () => {
    const err = await createKieClient({ apiKey: null }).submit(submitInput).catch((e) => e)
    expect(err).toBeInstanceOf(KieError)
    expect(err.apiCode).toBe('provider_error')
    expect(err.statusCode).toBe(502)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('POSTs createTask with resolution/aspect_ratio always explicit and audio off by default', async () => {
    stubFetch(200, { code: 200, data: { taskId: 'task-1' } })
    const { providerJobId } = await createKieClient({ apiKey: KEY }).submit(submitInput)

    expect(providerJobId).toBe('task-1')
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit]
    expect(url).toBe('https://api.kie.ai/api/v1/jobs/createTask')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe(`Bearer ${KEY}`)

    const body = sentBody()
    expect(body.model).toBe('bytedance/seedance-1.5-pro')
    expect(body.input.resolution).toBe('720p')
    expect(body.input.aspect_ratio).toBe('16:9')
    expect(body.input.duration).toBe(5)
    // CinemaStudio always mixes its own voiceover over the clip — a model-made
    // soundtrack is paid-for waste, so audio must default OFF, not inherit theirs.
    expect(body.input.generate_audio).toBe(false)
  })

  it('turns generate_audio on only when the caller explicitly priced audio', async () => {
    stubFetch(200, { code: 200, data: { taskId: 't' } })
    await createKieClient({ apiKey: KEY }).submit({ ...submitInput, audio: true })
    expect(sentBody().input.generate_audio).toBe(true)
  })

  // SUPERSEDED 2026-08-19. This used to assert that a seed frame was forwarded
  // "unconverted" — which was honest when nothing could produce a URL, and became
  // a bug the moment Pulse moved here: our seam carries data URIs, and a data URI
  // in input_urls is accepted into their queue and fails on the render, after the
  // charge. The seam now carries the URL alongside the bytes; see the
  // "travels as a URL" suite below for the rule that replaced this one.
  it('sends the seed frame URL the seam supplies', async () => {
    stubFetch(200, { code: 200, data: { taskId: 't' } })
    await createKieClient({ apiKey: KEY }).submit({
      ...submitInput,
      inputImage: 'data:image/png;base64,AAA',
      inputImageUrl: 'https://example.com/seed.png',
    })
    expect(sentBody().input.input_urls).toEqual(['https://example.com/seed.png'])
  })

  // THE MONEY TEST. They answer HTTP 200 with a business-failure envelope code —
  // an operator seeing "kie.ai rejected the job (HTTP 200)" with no further signal
  // is the failure mode this maps away from.
  it('maps an insufficient-credits refusal (HTTP 200, non-200 envelope code) to insufficient_credits', async () => {
    stubFetch(200, { code: 402, msg: 'insufficient balance for this task' })
    const err = await createKieClient({ apiKey: KEY }).submit(submitInput).catch((e) => e)
    expect(err).toBeInstanceOf(KieError)
    expect(err.apiCode).toBe('insufficient_credits')
    expect(err.providerDetail).toContain('insufficient balance')
  })

  it('maps any other envelope failure to a generic provider_error, message kept off the client', async () => {
    stubFetch(200, { code: 500, msg: 'internal error, account xyz over quota' })
    const err = await createKieClient({ apiKey: KEY }).submit(submitInput).catch((e) => e)
    expect(err.apiCode).toBe('provider_error')
    expect(err.message).not.toContain('account xyz')
    expect(err.providerDetail).toContain('account xyz')
  })

  it('throws provider_error when the API returns no taskId', async () => {
    stubFetch(200, { code: 200, data: {} })
    const err = await createKieClient({ apiKey: KEY }).submit(submitInput).catch((e) => e)
    expect(err).toBeInstanceOf(KieError)
    expect(err.apiCode).toBe('provider_error')
  })

  it('wraps a network failure in a sanitized KieError', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNRESET'))
    const err = await createKieClient({ apiKey: KEY }).submit(submitInput).catch((e) => e)
    expect(err).toBeInstanceOf(KieError)
    expect(err.apiCode).toBe('provider_error')
  })
})

describe('kie — poll', () => {
  const client = () => createKieClient({ apiKey: KEY })

  it('settles an unconfigured provider as error instead of throwing (row must refund, not spin)', async () => {
    const r = await createKieClient({ apiKey: null }).poll('t1')
    expect(r).toEqual({ status: 'error', message: 'kie provider is not configured' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('GETs recordInfo by taskId', async () => {
    stubFetch(200, { code: 200, data: { state: 'generating' } })
    await client().poll('t1')
    const [url] = fetchMock.mock.calls[0]! as [string]
    expect(url).toBe('https://api.kie.ai/api/v1/jobs/recordInfo?taskId=t1')
  })

  it.each(['waiting', 'queuing', 'generating'])('maps %s to processing', async (state) => {
    stubFetch(200, { code: 200, data: { state } })
    expect(await client().poll('t1')).toEqual({ status: 'processing', progress: null })
  })

  it('maps an absent state (freshly created task) to processing, not an invented terminal state', async () => {
    stubFetch(200, { code: 200, data: {} })
    expect(await client().poll('t1')).toEqual({ status: 'processing', progress: null })
  })

  it('maps success to the asset url and cost derived from creditsConsumed', async () => {
    stubFetch(200, {
      code: 200,
      data: {
        state: 'success',
        resultJson: '{"resultUrls":["https://tempfile.aiquickdraw.com/v.mp4"]}',
        creditsConsumed: 17.5,
      },
    })
    expect(await client().poll('t1')).toEqual({
      status: 'success',
      assetUrl: 'https://tempfile.aiquickdraw.com/v.mp4',
      costUsd: 17.5 * KIE_CREDIT_USD,
      nsfw: false,
    })
  })

  it('returns success-with-no-asset when resultJson is missing (service refunds)', async () => {
    stubFetch(200, { code: 200, data: { state: 'success', creditsConsumed: 17.5 } })
    const r = await client().poll('t1')
    expect(r.status).toBe('success')
    expect(r.status === 'success' && r.assetUrl).toBeUndefined()
  })

  it('maps fail to the neutral error state, including the fail code when present', async () => {
    stubFetch(200, { code: 200, data: { state: 'fail', failCode: 'CONTENT_POLICY', failMsg: 'nope' } })
    expect(await client().poll('t1')).toEqual({
      status: 'error',
      message: 'kie.ai failed this generation (CONTENT_POLICY)',
    })
  })

  // A transient status-call failure must NOT settle the row: the render is very
  // likely still running, and 'error' here would refund a job that then succeeds
  // and bills us anyway.
  it('treats a network failure on poll as still-processing, never a terminal error', async () => {
    fetchMock.mockRejectedValue(new Error('ETIMEDOUT'))
    expect(await client().poll('t1')).toEqual({ status: 'processing', progress: null })
  })

  it('treats a non-200 HTTP response or envelope code as still-processing', async () => {
    stubFetch(500, { code: 500, msg: 'server error' })
    expect(await client().poll('t1')).toEqual({ status: 'processing', progress: null })
  })
})

// ── image→video: input_urls takes URLs, max 2 ───────────────────────────────
// Their schema (docs, 2026-08-19) is explicit: `input_urls` is an array of URL
// STRINGS, not data URIs, capped at 2. This is the same shape Segmind has, and
// the same production failure it caused there — a queued job that renders
// nothing and refunds, after the charge.
describe('kie video — the seed frame travels as a URL', () => {
  it('sends input_urls from the public URL, never the bytes', async () => {
    stubFetch(200, { code: 200, data: { taskId: 't' } })
    await createKieClient({ apiKey: KEY }).submit({
      ...submitInput,
      inputImage: 'data:image/png;base64,AAA',
      inputImageUrl: 'https://app.example.com/media/seed.png',
    })
    const body = sentBody()
    expect(body.input.input_urls).toEqual(['https://app.example.com/media/seed.png'])
    expect(JSON.stringify(body)).not.toContain('data:image')
  })

  it('REFUSES a seed frame with no public URL, before spending anything', async () => {
    const client = createKieClient({ apiKey: KEY })
    await expect(
      client.submit({ ...submitInput, inputImage: 'data:image/png;base64,AAA' }),
    ).rejects.toThrow(/public/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('caps input_urls at the 2 their schema accepts', async () => {
    stubFetch(200, { code: 200, data: { taskId: 't' } })
    await createKieClient({ apiKey: KEY }).submit({
      ...submitInput,
      referenceImages: ['data:a', 'data:b', 'data:c'],
      referenceImageUrls: [
        'https://app.example.com/media/a.png',
        'https://app.example.com/media/b.png',
        'https://app.example.com/media/c.png',
      ],
    })
    // Sending 3 would be rejected outright — the whole job dies for the sake of a
    // third reference the model was never going to read.
    expect(body_input_urls(sentBody())).toHaveLength(2)
  })

  it('still submits a plain text→video job with neither', async () => {
    stubFetch(200, { code: 200, data: { taskId: 't' } })
    await createKieClient({ apiKey: KEY }).submit(submitInput)
    expect(sentBody().input).not.toHaveProperty('input_urls')
  })
})

function body_input_urls(body: { input: Record<string, unknown> }): unknown[] {
  return body.input.input_urls as unknown[]
}
