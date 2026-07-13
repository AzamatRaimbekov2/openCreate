// apps/api/test/deepinfra-client.test.ts
// The DeepInfra VideoProvider — Seedance 2.0 WITHOUT ByteDance's resource-pack wall.
//
// WHY THIS PROVIDER EXISTS AT ALL: the direct ByteDance channel is blocked by
// `ModelNotOpen` — the account must first buy a resource pack ($30.10 minimum,
// 90-day expiry, non-refundable) before Seedance 2.0 will run a single frame.
// DeepInfra resells the SAME model at the SAME price ($7/M tokens without a video
// input — their own published rate, identical to ByteDance's) with no activation,
// no prepay and no minimum. Same money, no wall.
//
// THE HARD PART, and what most of these tests pin: DeepInfra has NO POLLING
// ENDPOINT. Their API is synchronous (one HTTP call blocks for the whole ~60s
// generation) or webhook-driven. Our seam is submit → jobId → poll. So the adapter
// fires the request DETACHED and keeps the outcome in an in-process map keyed by a
// jobId it mints itself; poll() reads that map. The service, the money path and the
// SPA all stay exactly as they are.
//
// The cost of that choice is real and deliberate: in-flight jobs live in MEMORY, so
// an API restart loses them and the row sits 'processing' until the existing stale
// reaper fails + refunds it. A webhook is the correct long-term answer; this is the
// honest one that works today.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  DeepinfraError,
  createDeepinfraClient,
  resolutionFor,
  toDeepinfraModelId,
} from '../src/integrations/deepinfra/deepinfra-client'

const KEY = 'di-test'

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

function stubFetch(status: number, body: unknown) {
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
  model: 'deepinfra:ByteDance/Seedance-2.0',
}

const OK = {
  video_url: 'https://deepinfra.com/model/inference/x.mp4',
  status: 'ok',
  out_tokens: 108000,
  inference_status: { status: 'succeeded', cost: 0.756, runtime_ms: 61000 },
}

function sentBody() {
  const init = fetchMock.mock.calls[0]![1] as RequestInit
  return JSON.parse(init.body as string) as Record<string, unknown>
}

// submit() returns as soon as the request is IN FLIGHT, so a test must let the
// detached promise settle before poll() can see it.
const settle = () => new Promise((r) => setTimeout(r, 0))

describe('deepinfra — pure mapping', () => {
  it('strips the synthetic provider prefix off the model id', () => {
    expect(toDeepinfraModelId('deepinfra:ByteDance/Seedance-2.0')).toBe('ByteDance/Seedance-2.0')
  })

  // The SHORT edge names the tier: 720p portrait is 720×1280, so the 720 is the
  // width. Keying off the long edge would read every portrait clip as 1080p and
  // bill it at the higher rate ($7.7/M vs $7/M).
  it('derives the tier from the short edge, both orientations', () => {
    expect(resolutionFor(1280, 720)).toBe('720p')
    expect(resolutionFor(720, 1280)).toBe('720p')
    expect(resolutionFor(1920, 1080)).toBe('1080p')
    expect(resolutionFor(854, 480)).toBe('480p')
  })
})

describe('deepinfra — submit', () => {
  it('throws a clean provider_error (no fetch) when the token is unset', async () => {
    const err = await createDeepinfraClient({ apiKey: null })
      .submit(t2v)
      .catch((e) => e)
    expect(err).toBeInstanceOf(DeepinfraError)
    expect(err.apiCode).toBe('provider_error')
    expect(err.statusCode).toBe(502)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('POSTs to the model inference endpoint with bearer auth and returns a job id at once', async () => {
    stubFetch(200, OK)
    const { providerJobId } = await createDeepinfraClient({ apiKey: KEY }).submit(t2v)

    // The id is OURS: DeepInfra's sync API hands back no handle to poll, so the
    // adapter mints one and keys its own in-process result map on it.
    expect(providerJobId).toMatch(/^[0-9a-f-]{36}$/)

    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit]
    expect(url).toBe('https://api.deepinfra.com/v1/inference/ByteDance/Seedance-2.0')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('bearer di-test')
  })

  // THE MONEY TESTS. Every one of these defaults is a bill we would otherwise pay
  // for something nobody asked for.
  it('ALWAYS pins resolution and duration, never leaving them to the model', async () => {
    stubFetch(200, OK)
    await createDeepinfraClient({ apiKey: KEY }).submit(t2v)

    const body = sentBody()
    // Their `duration` accepts -1 = "let the model decide", and duration drives
    // BILLING — a model-picked 15s clip would cost 3× what the user was charged.
    expect(body.duration).toBe(5)
    // 720p is $7/M without a video input; 1080p is $7.7/M. Left unset, we would not
    // know which we were buying.
    expect(body.resolution).toBe('720p')
    expect(body.aspect_ratio).toBe('16:9')
  })

  it('turns native audio OFF and watermark OFF', async () => {
    stubFetch(200, OK)
    await createDeepinfraClient({ apiKey: KEY }).submit(t2v)

    const body = sentBody()
    // Same rule as every other provider here: CinemaStudio mixes its own voiceover
    // and music over the clip, so a model-generated soundtrack is paid-for waste.
    expect(body.generate_audio).toBe(false)
    expect(body.watermark).toBe(false)
  })

  it('sends an image→video seed frame as first_frame_image', async () => {
    stubFetch(200, OK)
    await createDeepinfraClient({ apiKey: KEY }).submit({
      ...t2v,
      inputImage: 'data:image/png;base64,AAAA',
    })
    expect(sentBody().first_frame_image).toBe('data:image/png;base64,AAAA')
  })

  it('forwards character references (up to their 9-image ceiling)', async () => {
    stubFetch(200, OK)
    await createDeepinfraClient({ apiKey: KEY }).submit({
      ...t2v,
      referenceImages: ['https://x/a.png', 'https://x/b.png'],
    })
    expect(sentBody().reference_images).toEqual(['https://x/a.png', 'https://x/b.png'])
  })

  it('propagates a transport failure so the row settles and refunds', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))
    const client = createDeepinfraClient({ apiKey: KEY })
    // The failure surfaces on POLL, not on submit: submit only starts the request.
    const { providerJobId } = await client.submit(t2v)
    await settle()
    const r = await client.poll(providerJobId)
    expect(r.status).toBe('error')
  })
})

describe('deepinfra — poll (the in-process job map)', () => {
  it('reads processing until the detached request settles', async () => {
    // A request that never resolves = a generation still rendering.
    fetchMock.mockReturnValue(new Promise(() => {}))
    const client = createDeepinfraClient({ apiKey: KEY })
    const { providerJobId } = await client.submit(t2v)
    expect(await client.poll(providerJobId)).toEqual({ status: 'processing', progress: null })
  })

  it('maps a finished request to success with the url AND the real billed cost', async () => {
    stubFetch(200, OK)
    const client = createDeepinfraClient({ apiKey: KEY })
    const { providerJobId } = await client.submit(t2v)
    await settle()

    // `cost` is DeepInfra's own number for this request — the ledger stops guessing.
    expect(await client.poll(providerJobId)).toEqual({
      status: 'success',
      assetUrl: 'https://deepinfra.com/model/inference/x.mp4',
      costUsd: 0.756,
    })
  })

  it('maps their error status to the neutral error state', async () => {
    stubFetch(200, { status: 'error', detail: 'moderation' })
    const client = createDeepinfraClient({ apiKey: KEY })
    const { providerJobId } = await client.submit(t2v)
    await settle()
    expect((await client.poll(providerJobId)).status).toBe('error')
  })

  it('maps an HTTP failure to the neutral error state, body kept off the message', async () => {
    stubFetch(402, { detail: 'insufficient balance for account 12345' })
    const client = createDeepinfraClient({ apiKey: KEY })
    const { providerJobId } = await client.submit(t2v)
    await settle()
    const r = await client.poll(providerJobId)
    expect(r.status).toBe('error')
    if (r.status === 'error') expect(r.message).not.toContain('12345')
  })

  // A jobId nobody submitted (or one lost to a restart) must SETTLE, not spin: a
  // row that can never be answered would hold the user's credits forever. The
  // stale reaper would eventually catch it, but an hour of a held charge is an
  // hour too long when the answer is knowable now.
  it('settles an unknown job id as an error rather than hanging forever', async () => {
    const client = createDeepinfraClient({ apiKey: KEY })
    const r = await client.poll('11111111-1111-4111-8111-111111111111')
    expect(r.status).toBe('error')
  })

  // The map must not grow forever: a settled job is read once by the service and
  // then never again.
  it('forgets a job once its terminal result has been read', async () => {
    stubFetch(200, OK)
    const client = createDeepinfraClient({ apiKey: KEY })
    const { providerJobId } = await client.submit(t2v)
    await settle()

    expect((await client.poll(providerJobId)).status).toBe('success')
    // Second read: the entry is gone, so it reads as the unknown-job error above.
    expect((await client.poll(providerJobId)).status).toBe('error')
  })
})
