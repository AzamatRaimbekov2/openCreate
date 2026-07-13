// apps/api/test/dashscope-client.test.ts
// The Alibaba Model Studio (DashScope) VideoProvider — the DIRECT Wan channel.
// These tests pin the wire contract that the API reference specifies and that a
// "helpful" refactor would silently break, in DESCENDING order of what it costs
// us to get wrong:
//
//   1. `resolution` is ALWAYS sent. Their default is 1080P at $0.15/s against
//      720P's $0.10 — leaving it implicit overcharges every clip by 50%.
//   2. the model id carries the MODE (`-t2v` / `-i2v`); the bare family 404s.
//   3. `X-DashScope-Async: enable` — without it, no task id ever comes back.
//   4. a moderation refusal settles as a REFUNDABLE content_blocked, not a 502.
//   5. the provider body (which can name internals) never reaches `message`.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  DashscopeError,
  createDashscopeClient,
  modeFor,
  resolutionFor,
  toDashscopeModelId,
} from '../src/integrations/alibaba/dashscope-client'

const KEY = 'sk-test'
const WS = 'ws-123'

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

const t2v = { prompt: 'a fox', width: 1280, height: 720, durationSeconds: 5, model: 'alibaba:wan2.7' }

function sentBody() {
  const init = fetchMock.mock.calls[0]![1] as RequestInit
  return JSON.parse(init.body as string) as {
    model: string
    input: Record<string, unknown>
    parameters: Record<string, unknown>
  }
}

describe('dashscope — pure mapping', () => {
  it('appends the mode suffix the API demands (bare family 404s)', () => {
    expect(toDashscopeModelId('alibaba:wan2.7', 't2v')).toBe('wan2.7-t2v')
    expect(toDashscopeModelId('alibaba:wan2.7', 'i2v')).toBe('wan2.7-i2v')
    expect(toDashscopeModelId('alibaba:wan2.7', 'r2v')).toBe('wan2.7-r2v')
  })

  // References win over a seed frame: a caller who tagged a character AND gave a
  // first frame wants the CHARACTER. r2v is the only mode that honours identity,
  // and it takes a first_frame too, so nothing is lost by preferring it.
  it('picks the mode from what is attached, references first', () => {
    expect(modeFor(false, 0)).toBe('t2v')
    expect(modeFor(true, 0)).toBe('i2v')
    expect(modeFor(false, 1)).toBe('r2v')
    expect(modeFor(true, 3)).toBe('r2v')
  })

  // The SHORT edge names the tier: 720P portrait is 720×1280, so the 720 is the
  // width. Keying off the long edge would read every portrait clip as 1080P and
  // bill it at 1.5×.
  it('derives the tier from the short edge, both orientations', () => {
    expect(resolutionFor(1280, 720)).toBe('720P')
    expect(resolutionFor(720, 1280)).toBe('720P')
    expect(resolutionFor(1920, 1080)).toBe('1080P')
    expect(resolutionFor(1080, 1920)).toBe('1080P')
  })
})

describe('dashscope — submit', () => {
  it('throws a clean provider_error (no fetch) when the key or workspace is unset', async () => {
    const err = await createDashscopeClient({ apiKey: null, workspaceId: WS })
      .submit(t2v)
      .catch((e) => e)
    expect(err).toBeInstanceOf(DashscopeError)
    expect(err.apiCode).toBe('provider_error')
    expect(err.statusCode).toBe(502)
    // A key without a workspace cannot even form a URL — it must not try.
    expect(fetchMock).not.toHaveBeenCalled()

    const err2 = await createDashscopeClient({ apiKey: KEY, workspaceId: null })
      .submit(t2v)
      .catch((e) => e)
    expect(err2).toBeInstanceOf(DashscopeError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('POSTs the async task to the workspace host and returns the task id', async () => {
    stubFetch(200, { output: { task_id: 'task-1', task_status: 'PENDING' } })
    const { providerJobId } = await createDashscopeClient({
      apiKey: KEY,
      workspaceId: WS,
    }).submit(t2v)

    expect(providerJobId).toBe('task-1')
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit]
    // The workspace id lives in the HOST — there is no account-wide endpoint.
    expect(url).toBe(
      'https://ws-123.ap-southeast-1.maas.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
    )
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer sk-test')
    // Without this the call runs SYNCHRONOUSLY and never yields a task id.
    expect(headers['X-DashScope-Async']).toBe('enable')
  })

  // THE MONEY TEST. Model Studio defaults `resolution` to 1080P, which bills at
  // $0.15/s against 720P's $0.10. An implicit resolution is a silent 50% overcharge
  // on every single clip — the exact bug class we just removed from the Runware path.
  it('ALWAYS sends resolution explicitly, never relying on their 1080P default', async () => {
    stubFetch(200, { output: { task_id: 't', task_status: 'PENDING' } })
    await createDashscopeClient({ apiKey: KEY, workspaceId: WS }).submit(t2v)

    const body = sentBody()
    expect(body.parameters.resolution).toBe('720P')
    expect(body.parameters.ratio).toBe('16:9')
    expect(body.parameters.duration).toBe(5)
    expect(body.model).toBe('wan2.7-t2v')
  })

  // Their prompt_extend defaults to TRUE: the model rewrites the prompt before
  // rendering. We compose prompts from structured presets and the stored prompt
  // must be what actually ran, or "Regenerate" produces something the row cannot
  // explain. Watermark is pinned so a default flip cannot brand paid output.
  it('pins prompt_extend off and watermark off', async () => {
    stubFetch(200, { output: { task_id: 't', task_status: 'PENDING' } })
    await createDashscopeClient({ apiKey: KEY, workspaceId: WS }).submit(t2v)

    const body = sentBody()
    expect(body.parameters.prompt_extend).toBe(false)
    expect(body.parameters.watermark).toBe(false)
  })

  it('sends an image→video seed frame as a media[] data URI and switches the model to i2v', async () => {
    stubFetch(200, { output: { task_id: 't', task_status: 'PENDING' } })
    await createDashscopeClient({ apiKey: KEY, workspaceId: WS }).submit({
      ...t2v,
      inputImage: 'data:image/png;base64,AAAA',
    })

    const body = sentBody()
    expect(body.model).toBe('wan2.7-i2v')
    expect(body.input.media).toEqual([
      { type: 'first_frame', url: 'data:image/png;base64,AAAA' },
    ])
  })

  // ── Reference-to-video: the same character across every shot ─────────────────
  //
  // This is what makes a FILM rather than a pile of clips: tag a character and it
  // is the same character in shot 2 as in shot 1. Verified live against the real
  // API — a reference frame of our fox in a snowy forest, prompted onto a tropical
  // beach, came back as the SAME fox.
  //
  // The wire shape was learned from the API itself, because Alibaba publishes no
  // R2V reference and the third-party wrappers document THEIR field names, not
  // DashScope's. A deliberately wrong request answers:
  //   input.media          → "Field required"
  //   input.media.0.type   → "Input should be 'reference_image', 'reference_video'
  //                           or 'first_frame'"
  // Hence: media[] with type `reference_image`, and the mode lives in the MODEL ID.
  it('switches to wan2.7-r2v and sends references as media[type=reference_image]', async () => {
    stubFetch(200, { output: { task_id: 't', task_status: 'PENDING' } })
    await createDashscopeClient({ apiKey: KEY, workspaceId: WS }).submit({
      ...t2v,
      referenceImages: ['data:image/png;base64,AAA', 'data:image/png;base64,BBB'],
    })

    const body = sentBody()
    expect(body.model).toBe('wan2.7-r2v')
    expect(body.input.media).toEqual([
      { type: 'reference_image', url: 'data:image/png;base64,AAA' },
      { type: 'reference_image', url: 'data:image/png;base64,BBB' },
    ])
  })

  // The three modes are three DIFFERENT model ids on their side, and the adapter
  // picks from what is attached. r2v wins over i2v: a caller that sends both a
  // character reference AND a seed frame wants the character — the seed frame is
  // the weaker signal, and r2v is the only mode that honours identity at all.
  it('prefers r2v over i2v when both a reference and a seed frame are present', async () => {
    stubFetch(200, { output: { task_id: 't', task_status: 'PENDING' } })
    await createDashscopeClient({ apiKey: KEY, workspaceId: WS }).submit({
      ...t2v,
      inputImage: 'data:image/png;base64,SEED',
      referenceImages: ['data:image/png;base64,REF'],
    })

    const body = sentBody()
    expect(body.model).toBe('wan2.7-r2v')
    // r2v accepts `first_frame` alongside references (the API's own allowed list),
    // so the seed frame is not thrown away — it rides along.
    expect(body.input.media).toEqual([
      { type: 'reference_image', url: 'data:image/png;base64,REF' },
      { type: 'first_frame', url: 'data:image/png;base64,SEED' },
    ])
  })

  it('stays on t2v when no reference and no seed frame are attached', async () => {
    stubFetch(200, { output: { task_id: 't', task_status: 'PENDING' } })
    await createDashscopeClient({ apiKey: KEY, workspaceId: WS }).submit(t2v)
    const body = sentBody()
    expect(body.model).toBe('wan2.7-t2v')
    expect(body.input.media).toBeUndefined()
  })

  // An empty array is not a reference. Sending `media: []` to r2v earns
  // "Field required: input.media" — a dead generation for a caller who tagged
  // nobody.
  it('treats an empty reference array as no references at all', async () => {
    stubFetch(200, { output: { task_id: 't', task_status: 'PENDING' } })
    await createDashscopeClient({ apiKey: KEY, workspaceId: WS }).submit({
      ...t2v,
      referenceImages: [],
    })
    const body = sentBody()
    expect(body.model).toBe('wan2.7-t2v')
    expect(body.input.media).toBeUndefined()
  })

  it('maps a moderation refusal to a REFUNDABLE content_blocked, not a generic 502', async () => {
    stubFetch(400, { code: 'DataInspectionFailed', message: 'input rejected' })
    const err = await createDashscopeClient({ apiKey: KEY, workspaceId: WS })
      .submit(t2v)
      .catch((e) => e)
    expect(err.apiCode).toBe('content_blocked')
    expect(err.statusCode).toBe(400)
  })

  it('keeps the provider body out of the client message but carries it for the log', async () => {
    stubFetch(404, { code: 'InvalidApiKey', message: 'workspace ws-123 is not authorized' })
    const err = await createDashscopeClient({ apiKey: KEY, workspaceId: WS })
      .submit(t2v)
      .catch((e) => e)
    // app.ts serializes `message` verbatim to the browser — internals stay out.
    expect(err.message).toBe('Model Studio HTTP 404')
    expect(err.message).not.toContain('ws-123')
    expect(err.providerDetail).toContain('InvalidApiKey')
  })

  it('throws provider_error when the API returns no task id', async () => {
    stubFetch(200, { output: { task_status: 'PENDING' } })
    const err = await createDashscopeClient({ apiKey: KEY, workspaceId: WS })
      .submit(t2v)
      .catch((e) => e)
    expect(err).toBeInstanceOf(DashscopeError)
    expect(err.apiCode).toBe('provider_error')
  })
})

describe('dashscope — poll', () => {
  const client = () => createDashscopeClient({ apiKey: KEY, workspaceId: WS })

  it('GETs the task by id on the workspace host', async () => {
    stubFetch(200, { output: { task_id: 't1', task_status: 'RUNNING' } })
    await client().poll('t1')
    const [url] = fetchMock.mock.calls[0]! as [string]
    expect(url).toBe('https://ws-123.ap-southeast-1.maas.aliyuncs.com/api/v1/tasks/t1')
  })

  it.each(['PENDING', 'RUNNING'])('maps %s to processing (they expose no progress %%)', async (s) => {
    stubFetch(200, { output: { task_status: s } })
    expect(await client().poll('t1')).toEqual({ status: 'processing', progress: null })
  })

  it('maps SUCCEEDED to success with the video url', async () => {
    stubFetch(200, {
      output: { task_status: 'SUCCEEDED', video_url: 'https://x.oss-ap-southeast-1.aliyuncs.com/v.mp4' },
    })
    expect(await client().poll('t1')).toEqual({
      status: 'success',
      assetUrl: 'https://x.oss-ap-southeast-1.aliyuncs.com/v.mp4',
    })
  })

  it('returns success-with-no-asset when SUCCEEDED carries no url (service refunds)', async () => {
    stubFetch(200, { output: { task_status: 'SUCCEEDED' } })
    expect(await client().poll('t1')).toEqual({ status: 'success', assetUrl: undefined })
  })

  it('maps FAILED to the neutral error state with the provider message', async () => {
    stubFetch(200, { output: { task_status: 'FAILED', message: 'render died' } })
    expect(await client().poll('t1')).toEqual({ status: 'error', message: 'render died' })
  })

  it('flags a moderation failure as blocked so the service refunds as content_blocked', async () => {
    stubFetch(200, { output: { task_status: 'FAILED', code: 'DataInspectionFailed' } })
    const r = await client().poll('t1')
    expect(r).toMatchObject({ status: 'error', blocked: true })
  })

  // CANCELED/UNKNOWN are terminal on their side. Treating them as 'processing'
  // would leave the row spinning forever with the user's credits held.
  it.each(['CANCELED', 'UNKNOWN'])('treats %s as a terminal error, never a stuck row', async (s) => {
    stubFetch(200, { output: { task_status: s } })
    expect((await client().poll('t1')).status).toBe('error')
  })

  it('maps an unrecognised status to processing rather than inventing a terminal state', async () => {
    stubFetch(200, { output: { task_status: 'SOMETHING_NEW' } })
    expect(await client().poll('t1')).toEqual({ status: 'processing', progress: null })
  })

  it('settles an unconfigured provider instead of throwing (row must refund, not spin)', async () => {
    const r = await createDashscopeClient({ apiKey: null, workspaceId: null }).poll('t1')
    expect(r.status).toBe('error')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
