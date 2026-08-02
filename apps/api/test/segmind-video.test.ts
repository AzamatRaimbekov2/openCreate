// apps/api/test/segmind-video.test.ts
// The Segmind VideoProvider — the cheapest surveyed Seedance 2.0 channel.
//
// WHY THIS SUITE MATTERS MORE THAN USUAL. Every other adapter here was written
// against an observed response; this one was not. The owner asked that no credits be
// spent proving the shape, so the SUCCESS envelope has never been seen. What IS
// verified came from free probes on 2026-08-02:
//   · POST /v2/{model} answered 402 with a valid body -> async submit route exists
//   · GET  /v2/requests/{id} answered 404 "Request not found" -> poll route exists
//   · `x-api-key` is the auth header; an empty balance is 402 (v2) / 406 (v1)
//
// So these tests pin the two things that survive an unknown shape: the REQUEST we
// send (every field of which is a bill), and that unknown responses degrade the safe
// way — 'processing' rather than a premature 'error' that would refund a live job.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  SegmindError,
  createSegmindClient,
  estimateCostUsd,
  readAssetUrl,
  readRequestId,
  readStatus,
  resolutionFor,
  toSegmindModelId,
} from '../src/integrations/segmind/segmind-video'

const KEY = 'sg-test'
const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

function reply(status: number, body: unknown) {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

const t2v = {
  prompt: 'a fox',
  width: 1280,
  height: 720,
  durationSeconds: 5,
  model: 'segmind:seedance-2.0',
}

function sentBody() {
  const init = fetchMock.mock.calls[0]![1] as RequestInit
  return JSON.parse(init.body as string) as Record<string, unknown>
}

describe('segmind — pure mapping', () => {
  it('strips the synthetic provider prefix, leaving the endpoint slug', () => {
    expect(toSegmindModelId('segmind:seedance-2.0')).toBe('seedance-2.0')
  })

  // The SHORT edge names the tier: 720p portrait is 720×1280, so the 720 is the
  // width. Keying off the long edge would read every portrait clip as 1080p and buy
  // it at more than twice the price.
  it('derives the tier from the short edge, both orientations', () => {
    expect(resolutionFor(1280, 720)).toBe('720p')
    expect(resolutionFor(720, 1280)).toBe('720p')
    expect(resolutionFor(1920, 1080)).toBe('1080p')
    expect(resolutionFor(854, 480)).toBe('480p')
  })

  // The token formula was confirmed against our own DeepInfra invoice (15s at
  // 1280×720 → formula 324 000, billed 324 900 = 0.28%). At Segmind's flat $7.00/M
  // that is $2.268 for the same clip, versus the $2.50173 DeepInfra actually took.
  it('estimates cost from the confirmed token formula at the flat $7.00/M rate', () => {
    expect(estimateCostUsd(1280, 720, 15)).toBeCloseTo(2.268, 3)
    expect(estimateCostUsd(1920, 1080, 15)).toBeCloseTo(5.103, 3)
  })
})

describe('segmind — submit', () => {
  it('throws a clean provider_error (no fetch) when the key is unset', async () => {
    const err = await createSegmindClient({ apiKey: null })
      .submit(t2v)
      .catch((e) => e)
    expect(err).toBeInstanceOf(SegmindError)
    expect(err.apiCode).toBe('provider_error')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('POSTs to the ASYNC /v2 route with x-api-key auth', async () => {
    reply(200, { request_id: 'req-1' })
    const { providerJobId } = await createSegmindClient({ apiKey: KEY }).submit(t2v)
    expect(providerJobId).toBe('req-1')

    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit]
    // /v2 is what makes this adapter STATELESS: it returns an id instead of holding
    // the socket for the whole render, so a restart cannot lose an in-flight job the
    // way deepinfra-client.ts does.
    expect(url).toBe('https://api.segmind.com/v2/seedance-2.0')
    expect((init.headers as Record<string, string>)['x-api-key']).toBe(KEY)
  })

  // THE MONEY TESTS. Each of these defaults is a bill we would otherwise pay for
  // something nobody asked for.
  it('ALWAYS pins duration and resolution, never leaving them to their defaults', async () => {
    reply(200, { request_id: 'req-1' })
    await createSegmindClient({ apiKey: KEY }).submit(t2v)

    const body = sentBody()
    // Their duration defaults to 10 — twice what a 5s clip should cost.
    expect(body.duration).toBe(5)
    // Their resolution defaults to 720p, so an unset field silently buys the 720p
    // row for a clip priced as 480p.
    expect(body.resolution).toBe('720p')
    expect(body.aspect_ratio).toBe('16:9')
  })

  it('turns native audio OFF explicitly', async () => {
    reply(200, { request_id: 'req-1' })
    await createSegmindClient({ apiKey: KEY }).submit(t2v)
    // Their schema already defaults this to false; sent anyway so a future default
    // flip on their side cannot silently double the bill.
    expect(sentBody().generate_audio).toBe(false)
  })

  it('categorises an empty balance instead of calling it a generic failure', async () => {
    // 402 on /v2 is the ONE upstream status an operator meets routinely and fixes in
    // half a minute — observed live on this very account at 0.0 credits.
    reply(402, { error: 'Insufficient credits. You have 0.0 credits.' })
    const err = await createSegmindClient({ apiKey: KEY })
      .submit(t2v)
      .catch((e) => e)
    expect(err.apiCode).toBe('insufficient_credits')
    // The upstream's own words stay on providerDetail, never on `message`, because
    // app.ts serializes `message` straight to the browser.
    expect(err.message).not.toContain('credits')
    expect(err.providerDetail).toContain('Insufficient credits')
  })

  it('THROWS rather than inventing an id when the submit shape is unrecognised', async () => {
    // The id field name is unverified. A miss must fail loudly: returning a fake id
    // would leave the service polling something that can never settle, holding the
    // user's credits until the stale reaper fires.
    const log = { warn: vi.fn() }
    reply(200, { some_unexpected_key: 'abc' })
    const err = await createSegmindClient({ apiKey: KEY, log })
      .submit(t2v)
      .catch((e) => e)
    expect(err).toBeInstanceOf(SegmindError)
    // ...and the raw body is logged, because that log line is the ONLY thing that
    // tells us which name to add on the first paid run.
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'segmind.unknown_submit_shape' }),
      expect.any(String),
    )
  })
})

describe('segmind — poll', () => {
  it('polls the /v2/requests route with the provider id', async () => {
    reply(200, { status: 'COMPLETED', output: 'https://cdn.example/v.mp4' })
    await createSegmindClient({ apiKey: KEY }).poll('req-1')
    expect(fetchMock.mock.calls[0]![0]).toBe('https://api.segmind.com/v2/requests/req-1')
  })

  it('maps a finished request to success with the asset url AND the raw envelope', async () => {
    reply(200, { status: 'COMPLETED', output: 'https://cdn.example/v.mp4' })
    const r = await createSegmindClient({ apiKey: KEY }).poll('req-1')
    expect(r).toEqual({
      status: 'success',
      assetUrl: 'https://cdn.example/v.mp4',
      nsfw: false,
      // Diagnostics — carried on TERMINAL states only, and shown by the /verify page
      // alone. It is what lets a single paid render pin down a response shape instead
      // of costing another $5 to guess again.
      raw: '{"status":"COMPLETED","output":"https://cdn.example/v.mp4"}',
    })
  })

  it('does NOT attach the raw body to a processing tick', async () => {
    // A poll loop runs dozens of times; attaching the envelope to every tick would be
    // pure noise in the logs and on the wire.
    reply(200, { status: 'QUEUED' })
    const r = await createSegmindClient({ apiKey: KEY }).poll('req-1')
    expect(r).toEqual({ status: 'processing', progress: null })
  })

  it('reports NO costUsd — Segmind states no billed figure', async () => {
    // Deliberate. `costUsd` means "what the provider charged" on every other channel
    // (DeepInfra's inference_status.cost, kie.ai's creditsConsumed). Filling it with
    // our own arithmetic would put an estimate on a margin dashboard next to two real
    // receipts and make them indistinguishable.
    reply(200, { status: 'COMPLETED', output: 'https://cdn.example/v.mp4' })
    const r = await createSegmindClient({ apiKey: KEY }).poll('req-1')
    expect(r.status === 'success' && 'costUsd' in r).toBe(false)
  })

  it('treats an UNKNOWN status as processing, never as an error', async () => {
    // The money rule: a premature 'error' refunds a job that is still rendering and
    // will still bill us, whereas an over-long 'processing' is bounded by the
    // caller's deadline and the stale reaper.
    reply(200, { status: 'SOME_NEW_STATE_THEY_ADDED' })
    const r = await createSegmindClient({ apiKey: KEY }).poll('req-1')
    expect(r).toEqual({ status: 'processing', progress: null })
  })

  it('treats a transport failure as processing, so a live job is not refunded', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))
    const r = await createSegmindClient({ apiKey: KEY }).poll('req-1')
    expect(r).toEqual({ status: 'processing', progress: null })
  })

  it('settles a 404 as an error — their results expire after ONE HOUR', async () => {
    // Far shorter than kie.ai's 24h. A late poll legitimately 404s on a job that
    // succeeded, so looping forever would hold the row open against an id that will
    // never resolve.
    reply(404, { error: 'Request req-1 not found' })
    const r = await createSegmindClient({ apiKey: KEY }).poll('req-1')
    expect(r.status).toBe('error')
  })

  it('settles a 422 as an error (their documented FAILED response)', async () => {
    reply(422, { error: 'generation failed' })
    const r = await createSegmindClient({ apiKey: KEY }).poll('req-1')
    expect(r.status).toBe('error')
  })

  it('logs the raw body when a terminal state carries no recognisable url', async () => {
    const log = { warn: vi.fn() }
    reply(200, { status: 'COMPLETED', mystery_field: 'https://cdn.example/v.mp4' })
    await createSegmindClient({ apiKey: KEY, log }).poll('req-1')
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'segmind.unknown_poll_shape' }),
      expect.any(String),
    )
  })
})

describe('segmind — the OBSERVED envelope (captured 2026-08-02)', () => {
  // Pinned from a real exchange. A probe meant to be rejected by validation was
  // accepted into the queue instead — an accident, but it captured the exact shape,
  // so it is nailed down here rather than left to drift.
  it('reads the request id out of the real submit envelope', () => {
    const observed = {
      poll_url: 'https://api.segmind.com/v1/requests/47411f110c6fa4fe05dcb9ffed2c1962',
      request_id: '47411f110c6fa4fe05dcb9ffed2c1962',
      response_url: 'https://api.segmind.com/v2/requests/47411f110c6fa4fe05dcb9ffed2c1962',
      status: 'QUEUED',
      status_url: 'https://api.segmind.com/v2/requests/47411f110c6fa4fe05dcb9ffed2c1962/status',
    }
    expect(readRequestId(observed)).toBe('47411f110c6fa4fe05dcb9ffed2c1962')
    // QUEUED is not a terminal state — it must NOT settle the row.
    expect(readStatus(observed)).toBe('processing')
  })

  it('settles the real FAILED envelope as an error, keeping their prose off the panel', async () => {
    // Their poll answers HTTP 422 for a failed job, with the reason in the body.
    reply(422, {
      error: 'Prompt is required for video generation.',
      metrics: { inference_time: 0.003372, queue_time: 0.025989 },
      status: 'FAILED',
    })
    const r = await createSegmindClient({ apiKey: KEY }).poll('req-1')
    expect(r.status).toBe('error')
    expect(r.status === 'error' && r.message).not.toContain('Prompt is required')
  })

  it('VALIDATES AFTER QUEUEING — a 200 on submit does not mean the body was accepted', async () => {
    // The trap this documents: an invalid request still mints a request id and
    // answers 200. Treating that as "well-formed" would have the service wait out a
    // full deadline on a job that was dead on arrival.
    reply(200, { request_id: 'req-1', status: 'QUEUED' })
    const { providerJobId } = await createSegmindClient({ apiKey: KEY }).submit(t2v)
    expect(providerJobId).toBe('req-1')
  })
})

describe('segmind — tolerant readers (the SUCCESS shape is still unverified)', () => {
  // Each reader accepts every plausible spelling rather than betting on one. The
  // alternative — hard-coding a guess — is how an adapter silently returns "success
  // with no asset" and makes the service refund a clip the user actually received.
  it('finds the request id under any of the plausible names', () => {
    expect(readRequestId({ request_id: 'a' })).toBe('a')
    expect(readRequestId({ requestId: 'b' })).toBe('b')
    expect(readRequestId({ id: 'c' })).toBe('c')
    expect(readRequestId({ poll_id: 'd' })).toBe('d')
    expect(readRequestId({ nothing: 1 })).toBeUndefined()
    expect(readRequestId(null)).toBeUndefined()
  })

  it('folds status vocabularies into the three states the service understands', () => {
    expect(readStatus({ status: 'COMPLETED' })).toBe('done')
    expect(readStatus({ status: 'succeeded' })).toBe('done')
    expect(readStatus({ state: 'SUCCESS' })).toBe('done')
    expect(readStatus({ status: 'FAILED' })).toBe('failed')
    expect(readStatus({ status: 'expired' })).toBe('failed')
    expect(readStatus({ status: 'QUEUED' })).toBe('processing')
    expect(readStatus({})).toBe('processing')
  })

  it('digs the asset url out of a string, an array or a nested object', () => {
    expect(readAssetUrl({ output: 'https://a/v.mp4' })).toBe('https://a/v.mp4')
    expect(readAssetUrl({ video_url: 'https://b/v.mp4' })).toBe('https://b/v.mp4')
    expect(readAssetUrl({ output: ['https://c/v.mp4'] })).toBe('https://c/v.mp4')
    expect(readAssetUrl({ output: { url: 'https://d/v.mp4' } })).toBe('https://d/v.mp4')
    // A non-url string must NOT pass: returning junk here would make the service
    // try to download it and fail confusingly, instead of refunding cleanly.
    expect(readAssetUrl({ output: 'PENDING' })).toBeUndefined()
    expect(readAssetUrl(null)).toBeUndefined()
  })
})
