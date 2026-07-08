// wan-runpod ComfyUI adapter tests. The adapter talks to our self-hosted
// ComfyUI HTTP API: submit POSTs a templated workflow graph to /prompt and
// returns the prompt_id; poll reads /history/<id> and resolves the SaveVideo
// output into a /view asset URL. Fetch is stubbed exactly like the runware
// client tests. A minimal stub workflow (same _meta.title contract as the real
// one) lets us assert precisely what gets injected into which node.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ComfyError, createComfyClient } from '../src/integrations/runpod/comfy-client'

afterEach(() => vi.unstubAllGlobals())

// Same node-title contract as spikes/wan-runpod/worker/workflows/wan22_t2v.json.
const stubWorkflow = () => ({
  '5': { class_type: 'CLIPTextEncode', inputs: { text: 'PLACEHOLDER_POSITIVE_PROMPT' }, _meta: { title: 'PROMPT_POSITIVE' } },
  '6': { class_type: 'CLIPTextEncode', inputs: { text: 'PLACEHOLDER_NEGATIVE_PROMPT' }, _meta: { title: 'PROMPT_NEGATIVE' } },
  '9': { class_type: 'EmptyHunyuanLatentVideo', inputs: { width: 1280, height: 720, length: 81, batch_size: 1 }, _meta: { title: 'LATENT_DIMS' } },
  '10': { class_type: 'KSamplerAdvanced', inputs: { noise_seed: 0, steps: 20 }, _meta: { title: 'SAMPLER_HIGH' } },
  '11': { class_type: 'KSamplerAdvanced', inputs: { noise_seed: 0, steps: 20 }, _meta: { title: 'SAMPLER_LOW' } },
  '14': { class_type: 'SaveVideo', inputs: { filename_prefix: 'wan_spike', format: 'mp4' }, _meta: { title: 'OUTPUT_VIDEO' } },
})

function stubFetch(status: number, body: unknown) {
  const fn = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', fn)
  return fn
}

// The shape of the graph the client POSTs. Keys are the finite set of node ids
// (a mapped type over a union, NOT an index signature) so accessing a specific
// node stays defined under noUncheckedIndexedAccess.
type SentNodeId = '5' | '6' | '9' | '10' | '11' | '14'
type SentGraph = { prompt: Record<SentNodeId, { inputs: Record<string, unknown> }>; client_id?: string }
const parseSent = (init: RequestInit): SentGraph => JSON.parse(String(init.body)) as SentGraph

const BASE = 'https://pod123-8188.proxy.runpod.net'

describe('comfy client — submit', () => {
  it('throws a clean provider_error (no fetch) when COMFY_BASE_URL is unset', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const client = createComfyClient({ baseUrl: null, workflow: stubWorkflow() })
    const err = await client
      .submit({ prompt: 'x', width: 1280, height: 720, durationSeconds: 5, model: 'wan' })
      .catch((e) => e)
    expect(err).toBeInstanceOf(ComfyError)
    expect(err.apiCode).toBe('provider_error')
    expect(err.statusCode).toBe(502)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('injects prompt/dims/seed/prefix into the titled nodes and POSTs the graph to /prompt', async () => {
    const fn = stubFetch(200, { prompt_id: 'pid-abc', number: 1, node_errors: {} })
    const client = createComfyClient({ baseUrl: BASE, workflow: stubWorkflow() })

    const { providerJobId } = await client.submit({
      prompt: 'a red fox running',
      width: 720,
      height: 1280,
      durationSeconds: 5,
      model: 'wan',
      seed: 4242,
    })

    expect(providerJobId).toBe('pid-abc')
    const [url, init] = fn.mock.calls[0]!
    expect(url).toBe(`${BASE}/prompt`)
    expect(init!.method).toBe('POST')
    const sent = parseSent(init!)
    expect(typeof sent.client_id).toBe('string')
    // Node injection by _meta.title.
    expect(sent.prompt['5'].inputs.text).toBe('a red fox running')
    expect(sent.prompt['9'].inputs).toMatchObject({ width: 720, height: 1280, length: 81 }) // 5*16+1
    expect(sent.prompt['10'].inputs.noise_seed).toBe(4242)
    expect(sent.prompt['11'].inputs.noise_seed).toBe(4242)
    expect(sent.prompt['14'].inputs.filename_prefix).not.toBe('wan_spike')
    expect(String(sent.prompt['14'].inputs.filename_prefix).length).toBeGreaterThan(0)
    // The negative placeholder must never be sent verbatim as a real prompt.
    expect(sent.prompt['6'].inputs.text).not.toBe('PLACEHOLDER_NEGATIVE_PROMPT')
  })

  it('does not mutate the shared workflow template between submits', async () => {
    stubFetch(200, { prompt_id: 'pid-1', node_errors: {} })
    const wf = stubWorkflow()
    const client = createComfyClient({ baseUrl: BASE, workflow: wf })
    await client.submit({ prompt: 'first', width: 720, height: 1280, durationSeconds: 5, model: 'wan' })
    // The template the client holds must be untouched — a per-submit deep clone.
    expect(wf['5'].inputs.text).toBe('PLACEHOLDER_POSITIVE_PROMPT')
    expect(wf['9'].inputs.length).toBe(81)
  })

  it('generates a random seed when none is supplied', async () => {
    const fn = stubFetch(200, { prompt_id: 'pid-2', node_errors: {} })
    const client = createComfyClient({ baseUrl: BASE, workflow: stubWorkflow() })
    await client.submit({ prompt: 'x', width: 720, height: 1280, durationSeconds: 5, model: 'wan' })
    const sent = parseSent(fn.mock.calls[0]![1]!)
    expect(typeof sent.prompt['10'].inputs.noise_seed).toBe('number')
    expect(sent.prompt['10'].inputs.noise_seed).toBe(sent.prompt['11'].inputs.noise_seed)
  })

  it('throws ComfyError when ComfyUI reports node_errors', async () => {
    stubFetch(200, { prompt_id: 'pid-3', node_errors: { '10': { errors: [{ message: 'bad seed' }] } } })
    const client = createComfyClient({ baseUrl: BASE, workflow: stubWorkflow() })
    await expect(
      client.submit({ prompt: 'x', width: 720, height: 1280, durationSeconds: 5, model: 'wan' }),
    ).rejects.toBeInstanceOf(ComfyError)
  })

  it('throws ComfyError on a non-2xx submit without leaking the response body', async () => {
    stubFetch(500, { detail: 'secret internals' })
    const client = createComfyClient({ baseUrl: BASE, workflow: stubWorkflow() })
    const err = await client
      .submit({ prompt: 'x', width: 720, height: 1280, durationSeconds: 5, model: 'wan' })
      .catch((e) => e)
    expect(err).toBeInstanceOf(ComfyError)
    expect(String(err.message)).not.toContain('secret internals')
    expect(String(err.message)).toContain('500')
  })
})

describe('comfy client — poll', () => {
  it('reports processing while /history is still empty (job queued/running)', async () => {
    stubFetch(200, {})
    const client = createComfyClient({ baseUrl: BASE, workflow: stubWorkflow() })
    expect(await client.poll('pid-abc')).toEqual({ status: 'processing', progress: null })
  })

  it('resolves the SaveVideo output into a /view asset URL on success (nsfw:false, self-host gap)', async () => {
    stubFetch(200, {
      'pid-abc': {
        status: { status_str: 'success', completed: true },
        outputs: {
          '14': { images: [{ filename: 'wan_job_00001.mp4', subfolder: '', type: 'output' }] },
        },
      },
    })
    const client = createComfyClient({ baseUrl: BASE, workflow: stubWorkflow() })
    const r = await client.poll('pid-abc')
    expect(r.status).toBe('success')
    if (r.status === 'success') {
      expect(r.assetUrl).toBe(`${BASE}/view?filename=wan_job_00001.mp4&subfolder=&type=output`)
      // Self-hosted ComfyUI has no provider-side NSFW check — documented gap.
      expect(r.nsfw).toBe(false)
    }
  })

  it('resolves the live-confirmed `videos[0]` SaveVideo output shape into a /view URL', async () => {
    // Verified live against the real pod (team-lead): native SaveVideo emits the
    // file descriptor under outputs[nodeId].videos[0] = { filename, subfolder,
    // type:'output' } — not `images`. The key-agnostic resolver must handle it.
    stubFetch(200, {
      'pid-abc': {
        status: { status_str: 'success', completed: true },
        outputs: {
          '14': { videos: [{ filename: 'oc_123_ab.mp4', subfolder: '', type: 'output' }] },
        },
      },
    })
    const client = createComfyClient({ baseUrl: BASE, workflow: stubWorkflow() })
    const r = await client.poll('pid-abc')
    expect(r.status).toBe('success')
    if (r.status === 'success')
      expect(r.assetUrl).toBe(`${BASE}/view?filename=oc_123_ab.mp4&subfolder=&type=output`)
  })

  it('maps a ComfyUI execution error in history to the neutral error state', async () => {
    stubFetch(200, {
      'pid-abc': {
        status: {
          status_str: 'error',
          completed: false,
          messages: [['execution_error', { exception_message: 'CUDA out of memory' }]],
        },
        outputs: {},
      },
    })
    const client = createComfyClient({ baseUrl: BASE, workflow: stubWorkflow() })
    const r = await client.poll('pid-abc')
    expect(r.status).toBe('error')
    if (r.status === 'error') expect(r.message).toContain('CUDA out of memory')
  })

  it('reports processing when the history entry exists but has produced no output yet', async () => {
    stubFetch(200, { 'pid-abc': { status: { completed: false }, outputs: {} } })
    const client = createComfyClient({ baseUrl: BASE, workflow: stubWorkflow() })
    expect(await client.poll('pid-abc')).toMatchObject({ status: 'processing' })
  })

  it('throws (transient) on a non-2xx /history so the row stays processing and retries', async () => {
    stubFetch(502, {})
    const client = createComfyClient({ baseUrl: BASE, workflow: stubWorkflow() })
    await expect(client.poll('pid-abc')).rejects.toBeInstanceOf(ComfyError)
  })
})
