// apps/api/test/failover-provider.test.ts
// The failover chain: ONE catalog model, several interchangeable backends behind
// it, tried in order until one accepts. The user picks "Auteur"; which company
// actually renders it is our business, and it can change between two clicks
// without them ever knowing.
//
// This exists because today taught us what a single-provider dependency costs: the
// Runware balance ran dry and PixVerse, Seedance 1.5, Kling, Veo, voiceover AND
// music all died at once. A chain turns "the provider is down" from an outage into
// a slower request.
//
// THE TWO RULES IT ENFORCES ARE MONEY RULES, and they are why this is a wrapper
// rather than a retry loop bolted onto the service:
//
//   1. FAIL OVER AT SUBMIT ONLY. Once a backend ACCEPTS a job it is rendering, and
//      we are being billed for it. If its poll then fails, re-submitting to the
//      next link would have us pay TWO providers for one generation the user paid
//      for once. A post-acceptance failure is a failed generation → refund. Full
//      stop.
//
//   2. NEVER FAIL OVER A CONTENT REFUSAL. Moderation is deterministic: the same
//      model, refusing the same frame, at a different reseller, refuses again.
//      Walking the chain on `content_blocked` would burn the whole chain's money on
//      one rejection — and the user would wait N× as long to be told the same no.
import { describe, expect, it, vi } from 'vitest'
import { createFailoverProvider, decodeJobId } from '../src/integrations/failover-provider'
import type { VideoProvider } from '../src/integrations/video-provider'

const fakeProvider = () =>
  ({ submit: vi.fn(), poll: vi.fn() }) as unknown as VideoProvider & {
    submit: ReturnType<typeof vi.fn>
    poll: ReturnType<typeof vi.fn>
  }

const input = {
  prompt: 'a fox',
  width: 1280,
  height: 720,
  durationSeconds: 5,
  model: 'deepinfra:ByteDance/Seedance-2.0',
}

// A transport/infrastructure failure — the shape every adapter throws for "I could
// not take this job" (unset key, 5xx, network, out of balance).
const infraError = () => Object.assign(new Error('provider down'), { apiCode: 'provider_error' })

// A content refusal — the model looked at the input and said no.
const blockedError = () =>
  Object.assign(new Error('real human face'), {
    apiCode: 'content_blocked',
    statusCode: 400,
  })

describe('failover — submit', () => {
  it('uses the first link when it accepts, and never touches the rest', async () => {
    const a = fakeProvider()
    const b = fakeProvider()
    a.submit.mockResolvedValue({ providerJobId: 'job-a' })

    const chain = createFailoverProvider([
      { id: 'deepinfra', provider: a },
      { id: 'bytedance', provider: b },
    ])
    const { providerJobId } = await chain.submit(input)

    // The winner is ENCODED in the id, because poll() must reach the backend that
    // actually took the job — not whichever one happens to be first tomorrow.
    expect(providerJobId).toBe('deepinfra#job-a')
    expect(b.submit).not.toHaveBeenCalled()
  })

  it('walks to the next link when the first cannot take the job', async () => {
    const a = fakeProvider()
    const b = fakeProvider()
    a.submit.mockRejectedValue(infraError())
    b.submit.mockResolvedValue({ providerJobId: 'cgt-1' })

    const chain = createFailoverProvider([
      { id: 'deepinfra', provider: a },
      { id: 'bytedance', provider: b },
    ])
    expect((await chain.submit(input)).providerJobId).toBe('bytedance#cgt-1')
    expect(a.submit).toHaveBeenCalledTimes(1)
  })

  // THE MONEY TEST. A refused frame is refused everywhere: same model, same
  // moderation. Walking the chain would pay N providers to hear one no.
  it('does NOT walk the chain on a content refusal — it rethrows at once', async () => {
    const a = fakeProvider()
    const b = fakeProvider()
    a.submit.mockRejectedValue(blockedError())

    const chain = createFailoverProvider([
      { id: 'deepinfra', provider: a },
      { id: 'bytedance', provider: b },
    ])
    const err = await chain.submit(input).catch((e) => e)

    expect(err.apiCode).toBe('content_blocked')
    // The whole point: the second backend was never asked.
    expect(b.submit).not.toHaveBeenCalled()
  })

  it('rethrows the LAST failure when every link is down', async () => {
    const a = fakeProvider()
    const b = fakeProvider()
    a.submit.mockRejectedValue(infraError())
    b.submit.mockRejectedValue(Object.assign(new Error('also down'), { apiCode: 'provider_error' }))

    const chain = createFailoverProvider([
      { id: 'deepinfra', provider: a },
      { id: 'bytedance', provider: b },
    ])
    const err = await chain.submit(input).catch((e) => e)

    // The service settles + refunds on this, exactly as it would for one provider.
    expect(err.apiCode).toBe('provider_error')
    expect(a.submit).toHaveBeenCalledTimes(1)
    expect(b.submit).toHaveBeenCalledTimes(1)
  })

  it('reports which link ran, so the outage is visible instead of merely survived', async () => {
    const a = fakeProvider()
    const b = fakeProvider()
    a.submit.mockRejectedValue(infraError())
    b.submit.mockResolvedValue({ providerJobId: 'cgt-1' })
    const onFailover = vi.fn()

    const chain = createFailoverProvider(
      [
        { id: 'deepinfra', provider: a },
        { id: 'bytedance', provider: b },
      ],
      { onFailover },
    )
    await chain.submit(input)

    // A chain that silently absorbs a dead provider is a chain that hides a dead
    // provider. It gets logged, every time.
    expect(onFailover).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'deepinfra', to: 'bytedance' }),
    )
  })
})

describe('failover — poll', () => {
  it('routes the poll to the link that actually accepted the job', async () => {
    const a = fakeProvider()
    const b = fakeProvider()
    b.poll.mockResolvedValue({ status: 'processing', progress: null })

    const chain = createFailoverProvider([
      { id: 'deepinfra', provider: a },
      { id: 'bytedance', provider: b },
    ])
    await chain.poll('bytedance#cgt-1')

    // The inner id is handed over UNWRAPPED — the backend has never heard of our
    // encoding and must not.
    expect(b.poll).toHaveBeenCalledWith('cgt-1')
    expect(a.poll).not.toHaveBeenCalled()
  })

  // A row written BEFORE the chain existed carries a bare provider job id. It must
  // keep polling, or every in-flight generation dies the moment this ships.
  it('polls the first link for a legacy job id with no link prefix', async () => {
    const a = fakeProvider()
    a.poll.mockResolvedValue({ status: 'processing', progress: null })

    const chain = createFailoverProvider([{ id: 'deepinfra', provider: a }])
    await chain.poll('plain-old-id')

    expect(a.poll).toHaveBeenCalledWith('plain-old-id')
  })

  // A job id naming a link that no longer exists (chain reconfigured, provider
  // removed) must SETTLE, not spin: a row nobody can answer holds the user's
  // credits until the stale reaper eventually frees them.
  it('settles as an error when the job names a link that is gone', async () => {
    const a = fakeProvider()
    const chain = createFailoverProvider([{ id: 'deepinfra', provider: a }])

    const r = await chain.poll('some-removed-provider#job-9')
    expect(r.status).toBe('error')
    expect(a.poll).not.toHaveBeenCalled()
  })

  // A POST-ACCEPTANCE failure is NOT a failover: that backend already started
  // rendering and is already billing us. Re-submitting elsewhere would pay twice.
  it('never re-submits when the accepted link fails at poll — it settles and refunds', async () => {
    const a = fakeProvider()
    const b = fakeProvider()
    a.poll.mockResolvedValue({ status: 'error', message: 'render died' })

    const chain = createFailoverProvider([
      { id: 'deepinfra', provider: a },
      { id: 'bytedance', provider: b },
    ])
    const r = await chain.poll('deepinfra#job-a')

    expect(r).toEqual({ status: 'error', message: 'render died' })
    expect(b.submit).not.toHaveBeenCalled()
    expect(b.poll).not.toHaveBeenCalled()
  })
})

describe('failover — job id encoding', () => {
  it('round-trips, and leaves an inner id containing the separator intact', () => {
    // A provider is free to hand back an id with a '#' in it; only the FIRST one is
    // ours. Splitting on every '#' would quietly corrupt such an id and lose the job.
    expect(decodeJobId('deepinfra#abc#def')).toEqual({ linkId: 'deepinfra', innerId: 'abc#def' })
    expect(decodeJobId('bare-id')).toEqual({ linkId: null, innerId: 'bare-id' })
  })
})
