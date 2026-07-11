// Task 8 tests: the Runware REST client's behavior contract — task envelope
// shape (array body, includeCost), errors[] → RunwareError mapping, getResponse
// poll-state mapping, and bounded retry on transient HTTP statuses.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRunwareClient, RunwareError } from '../src/integrations/runware/client'

const client = () => createRunwareClient({ apiKey: 'k' })
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function stubFetch(status: number, body: unknown) {
  const fn = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('runware client', () => {
  it('imageInference returns first data item', async () => {
    const fn = stubFetch(200, {
      data: [
        {
          taskType: 'imageInference',
          taskUUID: 't1',
          imageURL: 'https://im.runware.ai/x.jpg',
          cost: 0.002,
          NSFWContent: false,
          seed: 7,
        },
      ],
    })
    const res = await client().imageInference({
      taskUUID: 't1',
      positivePrompt: 'fox',
      model: 'runware:100@1',
      width: 1024,
      height: 1024,
    })
    expect(res.imageURL).toContain('im.runware.ai')
    const [, init] = fn.mock.calls[0]!
    const sent = JSON.parse(String(init!.body)) as Array<Record<string, unknown>>
    expect(Array.isArray(sent)).toBe(true)
    expect(sent[0]!.taskType).toBe('imageInference')
    expect(sent[0]!.includeCost).toBe(true)
  })

  it('maps runware errors[] to RunwareError', async () => {
    stubFetch(200, {
      data: [],
      errors: [{ taskUUID: 't1', code: 'invalidModel', message: 'bad model' }],
    })
    await expect(
      client().imageInference({
        taskUUID: 't1',
        positivePrompt: 'x',
        model: 'bad',
        width: 512,
        height: 512,
      }),
    ).rejects.toThrow(RunwareError)
  })

  it('getResponse passes through processing status with progress', async () => {
    stubFetch(200, {
      data: [{ taskType: 'videoInference', taskUUID: 't2', status: 'processing', progress: 40 }],
    })
    const res = await client().getResponse('t2')
    expect(res).toEqual({ status: 'processing', progress: 40 })
  })

  it('getResponse maps success payload', async () => {
    stubFetch(200, {
      data: [
        {
          taskType: 'videoInference',
          taskUUID: 't2',
          status: 'success',
          videoURL: 'https://vm.runware.ai/v.mp4',
          cost: 0.35,
        },
      ],
    })
    const res = await client().getResponse('t2')
    expect(res.status).toBe('success')
    if (res.status === 'success') expect(res.videoURL).toContain('vm.runware.ai')
  })

  it('retries once on transient 429 then succeeds', async () => {
    vi.useFakeTimers()
    const responses = [
      new Response('slow down', { status: 429 }),
      new Response(
        JSON.stringify({
          data: [{ taskType: 'imageInference', taskUUID: 't3', imageURL: 'https://im.runware.ai/y.jpg' }],
        }),
        { status: 200 },
      ),
    ]
    const fn = vi.fn<typeof fetch>(async () => responses.shift()!)
    vi.stubGlobal('fetch', fn)
    const pending = client().imageInference({
      taskUUID: 't3',
      positivePrompt: 'fox',
      model: 'runware:100@1',
      width: 1024,
      height: 1024,
    })
    await vi.advanceTimersByTimeAsync(1500)
    const res = await pending
    expect(res.imageURL).toContain('im.runware.ai')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('non-retryable HTTP error surfaces status only (never the key or body)', async () => {
    stubFetch(500, { detail: 'secret internals' })
    await expect(
      client().imageInference({
        taskUUID: 't4',
        positivePrompt: 'x',
        model: 'runware:100@1',
        width: 512,
        height: 512,
      }),
    ).rejects.toThrow('Runware HTTP 500')
  })
})

describe('runware 3dInference (Studio3D)', () => {
  const sentTask = (fn: ReturnType<typeof stubFetch>) => {
    const [, init] = fn.mock.calls[0]!
    return (JSON.parse(String(init!.body)) as Array<Record<string, unknown>>)[0]!
  }

  it('submits a 3dInference task with the image nested under inputs', async () => {
    const fn = stubFetch(200, { data: [{ taskType: '3dInference', taskUUID: 't1' }] })
    await client().submit3d({
      taskUUID: 't1',
      model: 'microsoft:trellis-2@4b',
      inputImage: 'data:image/png;base64,AAA',
    })
    const task = sentTask(fn)
    expect(task.taskType).toBe('3dInference')
    expect(task.deliveryMethod).toBe('async')
    expect(task.outputFormat).toBe('GLB')
    expect(task.includeCost).toBe(true)
    expect(task.taskUUID).toBe('t1')
    expect(task.model).toBe('microsoft:trellis-2@4b')
    // The image goes under `inputs.images` — a flat `inputImage` is silently ignored.
    expect(task.inputs).toEqual({ images: ['data:image/png;base64,AAA'] })
    expect(task).not.toHaveProperty('inputImage')
    // No `safety` param: 3dInference documents no safety filter, and Runware 400s
    // on an unsupported param (it already bit us on ByteDance and Wan 2.7).
    expect(task).not.toHaveProperty('safety')
  })

  it('sends the quality knobs under settings only when supplied', async () => {
    const bare = stubFetch(200, { data: [{ taskType: '3dInference', taskUUID: 't1' }] })
    await client().submit3d({ taskUUID: 't1', model: 'm', inputImage: 'data:image/png;base64,AAA' })
    // Absent knobs must not serialize as `undefined` keys — Runware rejects params
    // a model does not know, and an explicit null/undefined is still a param.
    expect(sentTask(bare).settings).toEqual({ imageAutoFix: true, texture: true })

    const withKnobs = stubFetch(200, { data: [{ taskType: '3dInference', taskUUID: 't2' }] })
    await client().submit3d({
      taskUUID: 't2',
      model: 'm',
      inputImage: 'data:image/png;base64,AAA',
      pbr: true,
      faceLimit: 20_000,
    })
    const task = sentTask(withKnobs)
    expect(task.settings).toEqual({
      imageAutoFix: true,
      texture: true,
      pbr: true,
      faceLimit: 20_000,
    })
    // Knobs belong in settings, never flat on the task envelope.
    expect(task).not.toHaveProperty('pbr')
    expect(task).not.toHaveProperty('faceLimit')
  })

  it('reads the finished mesh out of outputs.files[0].url', async () => {
    stubFetch(200, {
      data: [
        {
          taskType: '3dInference',
          taskUUID: 't1',
          cost: 0.0256,
          outputs: { files: [{ uuid: 'f1', url: 'https://im.runware.ai/x/model.glb' }] },
        },
      ],
    })
    const res = await client().getResponse('t1')
    expect(res.status).toBe('success')
    if (res.status !== 'success') throw new Error('expected success')
    expect(res.meshURL).toBe('https://im.runware.ai/x/model.glb')
    expect(res.cost).toBe(0.0256)
  })

  it('still reports processing with progress for an unfinished 3d task', async () => {
    stubFetch(200, { data: [{ taskType: '3dInference', status: 'processing', progress: 40 }] })
    expect(await client().getResponse('t1')).toEqual({ status: 'processing', progress: 40 })
  })

  it('does not read a mesh out of a malformed outputs envelope', async () => {
    // An `outputs` with no usable file url must NOT settle as a success with no
    // asset: that is the shape that would make the service refund a paid job.
    stubFetch(200, { data: [{ taskType: '3dInference', taskUUID: 't1', outputs: { files: [] } }] })
    expect(await client().getResponse('t1')).toEqual({
      status: 'error',
      message: 'unexpected poll payload',
    })
  })
})

// Regression guard: adding the mesh path to getResponse must not disturb the
// image/video/audio poll paths, which carry a FLAT *URL field and no `outputs`.
describe('getResponse still parses the flat image/video/audio success shape', () => {
  it.each([
    ['videoURL', 'https://vm.runware.ai/v.mp4'],
    ['imageURL', 'https://im.runware.ai/i.webp'],
    ['audioURL', 'https://au.runware.ai/a.mp3'],
  ])('parses a success carrying only %s', async (field, url) => {
    stubFetch(200, {
      data: [{ taskType: 'videoInference', taskUUID: 't9', status: 'success', [field]: url, cost: 0.35 }],
    })
    const res = await client().getResponse('t9')
    expect(res.status).toBe('success')
    if (res.status !== 'success') throw new Error('expected success')
    expect(res[field as 'videoURL' | 'imageURL' | 'audioURL']).toBe(url)
    expect(res.cost).toBe(0.35)
    // No `outputs` in the payload → no mesh, and crucially no throw while probing for one.
    expect(res.meshURL).toBeUndefined()
  })
})

describe('model-specific parameter compatibility', () => {
  it('submitVideo omits the safety param (and the flag itself) when omitSafety is set', async () => {
    const fn = stubFetch(200, {
      data: [{ taskType: 'videoInference', taskUUID: 't3', status: 'processing' }],
    })
    await client().submitVideo({
      taskUUID: 't3',
      positivePrompt: 'jellyfish',
      model: 'bytedance:seedance@1.5-pro',
      width: 720,
      height: 1280,
      duration: 5,
      omitSafety: true,
    })
    const [, init] = fn.mock.calls[0]!
    const sent = JSON.parse(String(init!.body)) as Array<Record<string, unknown>>
    expect(sent[0]).not.toHaveProperty('safety')
    expect(sent[0]).not.toHaveProperty('omitSafety')
  })
  it('surfaces the structured runware error message on non-2xx responses', async () => {
    stubFetch(400, {
      data: [],
      errors: [{ code: 'unsupportedParameter', message: "Unsupported use of 'safety' parameter." }],
    })
    await expect(
      client().submitVideo({
        taskUUID: 't4',
        positivePrompt: 'x',
        model: 'bytedance:seedance@1.5-pro',
        width: 720,
        height: 1280,
        duration: 5,
      }),
    ).rejects.toThrow(/Unsupported use of 'safety'/)
  })
})
