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
