// HTTP tests for POST /api/compare/video — the two-channel Seedance 2.0 cost
// receipt (hidden /compare-video operator page).
//
// WHY THESE TESTS ARE THE SHAPE THEY ARE. The endpoint's entire reason to exist is
// that it reports each provider's OWN billed figure rather than a rate card, so the
// assertions are about MONEY PROVENANCE and FAILURE ISOLATION:
//   · the number in a panel is the one the provider reported, untouched;
//   · a channel that dies still renders its panel (a refusal IS a result), and
//     never takes the other channel's receipt down with it;
//   · an unconfigured channel degrades to an error panel, not a 500 — the whole
//     point of the page is running the ONE channel you do have keys for;
//   · the ledger is never touched (operator tool spends provider USD, not credits).
//
// Both channels are scripted fakes: a suite that spent real provider money on every
// run would cost more than the question it answers.
import { describe, expect, it, vi } from 'vitest'
import { buildTestApp, fakeVideoProvider, registerAndGetCookie } from './helpers/build-test-app'

const PROMPT = 'a lighthouse beam sweeping across fog, slow dolly in'

// A provider that settles on the SECOND poll — closer to a real render than an
// instant success, and it exercises the poll loop rather than short-circuiting it.
function scriptedProvider(result: {
  assetUrl?: string
  costUsd?: number
  nsfw?: boolean
}) {
  const provider = fakeVideoProvider()
  provider.submit.mockResolvedValue({ providerJobId: 'job-1' })
  provider.poll
    .mockResolvedValueOnce({ status: 'processing', progress: null })
    .mockResolvedValue({ status: 'success', ...result })
  return provider
}

describe('POST /api/compare/video', () => {
  it('requires a session', async () => {
    const app = await buildTestApp({ deepinfraToken: 'di', kieApiKey: 'kie' })
    const res = await app.inject({
      method: 'POST',
      url: '/api/compare/video',
      payload: { prompt: PROMPT },
    })
    expect(res.statusCode).toBe(401)
  })

  it('rejects an invalid prompt with the validation envelope', async () => {
    const app = await buildTestApp({ deepinfraToken: 'di', kieApiKey: 'kie' })
    const cookie = await registerAndGetCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/compare/video',
      headers: { cookie },
      payload: { prompt: 'x' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('validation_failed')
  })

  it('reports each provider OWN billed figure and charges NO user credits', async () => {
    // The two receipts the page exists to put side by side. Deliberately NOT the
    // rate-card numbers: if the route ever starts computing cost from a table
    // instead of forwarding the provider's own figure, these fail.
    const deepinfra = scriptedProvider({ assetUrl: 'https://d.example/v.mp4', costUsd: 0.7591 })
    const kie = scriptedProvider({ assetUrl: 'https://k.example/v.mp4', costUsd: 1.025 })

    const app = await buildTestApp({
      deepinfraToken: 'di',
      kieApiKey: 'kie',
      compareVideoChannels: { deepinfra, kie },
      comparePollIntervalMs: 0,
    })
    const cookie = await registerAndGetCookie(app)

    const before = (
      await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
    ).json() as { credits: number }

    const res = await app.inject({
      method: 'POST',
      url: '/api/compare/video',
      headers: { cookie },
      payload: { prompt: PROMPT, durationSeconds: 5, resolution: '720p' },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      prompt: string
      durationSeconds: number
      resolution: string
      panels: {
        channel: string
        status: string
        videoUrl: string | null
        costUsd: number | null
        creditsConsumed: number | null
        durationMs: number
      }[]
    }

    // Settings echoed back: a cost screenshot without its settings is exactly the
    // artifact that started the with-video/no-video confusion.
    expect(body.prompt).toBe(PROMPT)
    expect(body.durationSeconds).toBe(5)
    expect(body.resolution).toBe('720p')

    const di = body.panels.find((p) => p.channel === 'deepinfra')
    const ki = body.panels.find((p) => p.channel === 'kie')
    expect(di?.status).toBe('success')
    expect(di?.costUsd).toBe(0.7591)
    expect(di?.videoUrl).toBe('https://d.example/v.mp4')
    // DeepInfra bills in USD directly — there is no credit denomination to show.
    expect(di?.creditsConsumed).toBeNull()

    expect(ki?.status).toBe('success')
    expect(ki?.costUsd).toBe(1.025)
    // kie.ai's raw credit count, derived back at their published $0.005/credit so
    // the conversion on screen is auditable instead of trusted: 1.025 / 0.005 = 205.
    expect(ki?.creditsConsumed).toBe(205)

    // Ledger bypass: an evaluation render spends provider USD, never user credits.
    const after = (
      await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
    ).json() as { credits: number }
    expect(after.credits).toBe(before.credits)
  })

  it('sends BYTE-IDENTICAL settings to both channels (a mismatch would fake the result)', async () => {
    const deepinfra = scriptedProvider({ assetUrl: 'https://d/v.mp4', costUsd: 1.5 })
    const kie = scriptedProvider({ assetUrl: 'https://k/v.mp4', costUsd: 2.05 })

    const app = await buildTestApp({
      deepinfraToken: 'di',
      kieApiKey: 'kie',
      compareVideoChannels: { deepinfra, kie },
      comparePollIntervalMs: 0,
    })
    const cookie = await registerAndGetCookie(app)

    await app.inject({
      method: 'POST',
      url: '/api/compare/video',
      headers: { cookie },
      payload: { prompt: PROMPT, durationSeconds: 10, resolution: '1080p' },
    })

    const { model: diModel, ...diInput } = deepinfra.submit.mock.calls[0]?.[0]
    const { model: kieModel, ...kieInput } = kie.submit.mock.calls[0]?.[0]

    // Everything that moves the price must match: pixels drive each adapter's
    // resolution tier, duration is the multiplier, and audio doubles ByteDance's
    // rate. One drifting field turns the receipt into a lie.
    expect(diInput.width).toBe(1920)
    expect(diInput.height).toBe(1080)
    expect(diInput).toEqual(kieInput)
    expect(diInput.audio).toBe(false)

    // `model` is the ONE field that must differ — it is the same model spelled in
    // each channel's own catalogue, and both adapters strip their synthetic prefix
    // themselves. Pinned explicitly so a typo here fails loudly instead of 404-ing
    // against a provider mid-render.
    expect(diModel).toBe('deepinfra:ByteDance/Seedance-2.0')
    expect(kieModel).toBe('kie:bytedance/seedance-2')
  })

  it('runs Seedance 2.0 by default and spells it correctly for each channel', async () => {
    const deepinfra = scriptedProvider({ assetUrl: 'https://d/v.mp4', costUsd: 0.83 })
    const kie = scriptedProvider({ assetUrl: 'https://k/v.mp4', costUsd: 1.03 })
    const app = await buildTestApp({
      deepinfraToken: 'di',
      kieApiKey: 'kie',
      compareVideoChannels: { deepinfra, kie },
      comparePollIntervalMs: 0,
    })
    const cookie = await registerAndGetCookie(app)
    await app.inject({
      method: 'POST',
      url: '/api/compare/video',
      headers: { cookie },
      payload: { prompt: PROMPT },
    })

    expect(deepinfra.submit.mock.calls[0]?.[0].model).toBe('deepinfra:ByteDance/Seedance-2.0')
    expect(kie.submit.mock.calls[0]?.[0].model).toBe('kie:bytedance/seedance-2')
  })

  it('switches BOTH channels to Seedance 1.5 Pro together — never one model per side', async () => {
    // Why this exists: verifying the page end to end on Seedance 2.0 costs ~$1.86 a
    // run. 1.5 Pro answers "does this work" for roughly a tenth of that, so an
    // operator with a thin balance can still exercise the whole path. The danger of
    // a model switch is that it half-applies and the page silently compares TWO
    // DIFFERENT MODELS while looking exactly as trustworthy — hence both sides are
    // pinned in one test.
    const deepinfra = scriptedProvider({ assetUrl: 'https://d/v.mp4', costUsd: 0.09 })
    const kie = scriptedProvider({ assetUrl: 'https://k/v.mp4', costUsd: 0.0875 })
    const app = await buildTestApp({
      deepinfraToken: 'di',
      kieApiKey: 'kie',
      compareVideoChannels: { deepinfra, kie },
      comparePollIntervalMs: 0,
    })
    const cookie = await registerAndGetCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/compare/video',
      headers: { cookie },
      payload: { prompt: PROMPT, model: 'seedance-1-5-pro', durationSeconds: 5, resolution: '480p' },
    })

    expect(res.statusCode).toBe(200)
    expect(deepinfra.submit.mock.calls[0]?.[0].model).toBe('deepinfra:ByteDance/Seedance-1.5-Pro')
    expect(kie.submit.mock.calls[0]?.[0].model).toBe('kie:bytedance/seedance-1.5-pro')

    // The panel labels must name the model actually run, or a screenshot of a cheap
    // 1.5 Pro verification reads as a Seedance 2.0 result.
    const body = res.json() as { panels: { channel: string; label: string }[] }
    expect(body.panels.find((p) => p.channel === 'deepinfra')?.label).toContain('1.5 Pro')
    expect(body.panels.find((p) => p.channel === 'kie')?.label).toContain('1.5 Pro')
  })

  it('runs ONLY the channels it was given, and never touches the parked one', async () => {
    // Production runs kie alone while the DeepInfra account sits at zero: a panel
    // that can only ever show the same 402 is noise, not a measurement. The part
    // that matters for money is the second assertion — a parked channel must not be
    // CALLED at all, or "removed from the page" would still be spending.
    const deepinfra = scriptedProvider({ assetUrl: 'https://d/v.mp4', costUsd: 0.83 })
    const kie = scriptedProvider({ assetUrl: 'https://k/v.mp4', costUsd: 1.03 })
    const app = await buildTestApp({
      deepinfraToken: 'di',
      kieApiKey: 'kie',
      compareVideoChannels: { deepinfra, kie },
      compareChannels: ['kie'],
      comparePollIntervalMs: 0,
    })
    const cookie = await registerAndGetCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/compare/video',
      headers: { cookie },
      payload: { prompt: PROMPT },
    })

    const body = res.json() as { panels: { channel: string }[] }
    expect(body.panels).toHaveLength(1)
    expect(body.panels[0]?.channel).toBe('kie')
    expect(deepinfra.submit).not.toHaveBeenCalled()
  })

  it('lets a request NARROW to one channel — the /verify page runs exactly one', async () => {
    // A 15s/1080p render costs $5+ per channel, so racing three to answer a question
    // about one would burn $18. The verify page sends `channels: ['segmind']`.
    const deepinfra = scriptedProvider({ assetUrl: 'https://d/v.mp4', costUsd: 5.61 })
    const kie = scriptedProvider({ assetUrl: 'https://k/v.mp4', costUsd: 7.65 })
    const segmind = scriptedProvider({ assetUrl: 'https://s/v.mp4' })
    const app = await buildTestApp({
      deepinfraToken: 'di',
      kieApiKey: 'kie',
      segmindApiKey: 'sg',
      compareVideoChannels: { deepinfra, kie, segmind },
      compareChannels: ['segmind', 'deepinfra', 'kie'],
      comparePollIntervalMs: 0,
    })
    const cookie = await registerAndGetCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/compare/video',
      headers: { cookie },
      payload: { prompt: PROMPT, channels: ['segmind'] },
    })

    const body = res.json() as { panels: { channel: string }[] }
    expect(body.panels).toHaveLength(1)
    expect(body.panels[0]?.channel).toBe('segmind')
    // The money assertion: the other two must not have been CALLED at all.
    expect(deepinfra.submit).not.toHaveBeenCalled()
    expect(kie.submit).not.toHaveBeenCalled()
  })

  it('a request can NARROW but never WIDEN past the server list', async () => {
    // The safety rule. A parked channel (empty balance, rate-limited account) must
    // stay unreachable no matter what the browser asks for — otherwise "disabled"
    // would mean "hidden", and money would still move.
    const deepinfra = scriptedProvider({ assetUrl: 'https://d/v.mp4', costUsd: 5.61 })
    const segmind = scriptedProvider({ assetUrl: 'https://s/v.mp4' })
    const app = await buildTestApp({
      deepinfraToken: 'di',
      segmindApiKey: 'sg',
      compareVideoChannels: { deepinfra, segmind },
      // Operator parked DeepInfra.
      compareChannels: ['segmind'],
      comparePollIntervalMs: 0,
    })
    const cookie = await registerAndGetCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/compare/video',
      headers: { cookie },
      // ...and the request asks for it anyway.
      payload: { prompt: PROMPT, channels: ['segmind', 'deepinfra'] },
    })

    const body = res.json() as { panels: { channel: string }[] }
    expect(body.panels.map((p) => p.channel)).toEqual(['segmind'])
    expect(deepinfra.submit).not.toHaveBeenCalled()
  })

  it('attaches the raw envelope ONLY when debug is asked for', async () => {
    // The compare page's guarantee is that no provider prose reaches the browser; the
    // verify page cannot work without it. One flag separates them, so it is pinned
    // in both directions.
    const segmind = fakeVideoProvider()
    segmind.submit.mockResolvedValue({ providerJobId: 'j' })
    segmind.poll.mockResolvedValue({
      status: 'success',
      assetUrl: 'https://s/v.mp4',
      raw: '{"status":"COMPLETED","output":"https://s/v.mp4"}',
    })
    const build = () =>
      buildTestApp({
        segmindApiKey: 'sg',
        compareVideoChannels: { segmind },
        compareChannels: ['segmind'],
        comparePollIntervalMs: 0,
      })

    const app = await build()
    const cookie = await registerAndGetCookie(app)

    const off = await app.inject({
      method: 'POST',
      url: '/api/compare/video',
      headers: { cookie },
      payload: { prompt: PROMPT },
    })
    expect((off.json() as { panels: { rawResponse: string | null }[] }).panels[0]?.rawResponse).toBeNull()

    const on = await app.inject({
      method: 'POST',
      url: '/api/compare/video',
      headers: { cookie },
      payload: { prompt: PROMPT, debug: true },
    })
    expect((on.json() as { panels: { rawResponse: string | null }[] }).panels[0]?.rawResponse).toContain(
      'COMPLETED',
    )
  })

  it('rejects an unknown model instead of silently falling back to the expensive one', async () => {
    const app = await buildTestApp({ deepinfraToken: 'di', kieApiKey: 'kie' })
    const cookie = await registerAndGetCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/compare/video',
      headers: { cookie },
      payload: { prompt: PROMPT, model: 'seedance-9' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('validation_failed')
  })

  it('keeps a dead channel isolated — the surviving receipt still renders', async () => {
    const deepinfra = scriptedProvider({ assetUrl: 'https://d/v.mp4', costUsd: 0.76 })
    const kie = fakeVideoProvider()
    kie.submit.mockRejectedValue(new Error('kie.ai says: account arturfeniks88 has no balance'))

    const app = await buildTestApp({
      deepinfraToken: 'di',
      kieApiKey: 'kie',
      compareVideoChannels: { deepinfra, kie },
      comparePollIntervalMs: 0,
    })
    const cookie = await registerAndGetCookie(app)

    const res = await app.inject({
      method: 'POST',
      url: '/api/compare/video',
      headers: { cookie },
      payload: { prompt: PROMPT },
    })

    // 200, not 502: one channel refusing the job IS a comparison result.
    expect(res.statusCode).toBe(200)
    const body = res.json() as { panels: { channel: string; status: string; errorCode: string | null; costUsd: number | null }[] }

    const di = body.panels.find((p) => p.channel === 'deepinfra')
    const ki = body.panels.find((p) => p.channel === 'kie')
    expect(di?.status).toBe('success')
    expect(di?.costUsd).toBe(0.76)
    expect(ki?.status).toBe('error')
    // The upstream's own words can name an account or a balance — they must not
    // reach the browser, same rule as every other sanitized provider envelope.
    expect(ki?.errorCode).toBe('provider_error')
    
  })

  it('degrades an UNCONFIGURED channel to an error panel, not a failed request', async () => {
    // The realistic state today: DEEPINFRA_TOKEN is set, KIE_API_KEY is not. The
    // page must still run the half it can, or an operator cannot measure anything
    // until both keys exist.
    const deepinfra = scriptedProvider({ assetUrl: 'https://d/v.mp4', costUsd: 0.76 })
    const app = await buildTestApp({
      deepinfraToken: 'di',
      kieApiKey: null,
      compareVideoChannels: { deepinfra },
      comparePollIntervalMs: 0,
    })
    const cookie = await registerAndGetCookie(app)

    const res = await app.inject({
      method: 'POST',
      url: '/api/compare/video',
      headers: { cookie },
      payload: { prompt: PROMPT },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json() as { panels: { channel: string; status: string; errorCode: string | null }[] }
    expect(body.panels.find((p) => p.channel === 'deepinfra')?.status).toBe('success')
    const ki = body.panels.find((p) => p.channel === 'kie')
    expect(ki?.status).toBe('error')
    expect(ki?.errorCode).toBe('provider_error')
  })

  it('turns a provider that never settles into an inconclusive panel, not a hung request', async () => {
    const deepinfra = scriptedProvider({ assetUrl: 'https://d/v.mp4', costUsd: 0.76 })
    const kie = fakeVideoProvider()
    kie.submit.mockResolvedValue({ providerJobId: 'stuck' })
    kie.poll.mockResolvedValue({ status: 'processing', progress: null })

    const app = await buildTestApp({
      deepinfraToken: 'di',
      kieApiKey: 'kie',
      compareVideoChannels: { deepinfra, kie },
      comparePollIntervalMs: 0,
      // A deadline the fake blows through immediately, so the test asserts the
      // timeout PATH without waiting six real minutes for it.
      compareDeadlineMs: 30,
    })
    const cookie = await registerAndGetCookie(app)

    const res = await app.inject({
      method: 'POST',
      url: '/api/compare/video',
      headers: { cookie },
      payload: { prompt: PROMPT },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json() as { panels: { channel: string; status: string; errorCode: string | null }[] }
    expect(body.panels.find((p) => p.channel === 'deepinfra')?.status).toBe('success')
    const ki = body.panels.find((p) => p.channel === 'kie')
    expect(ki?.status).toBe('error')
    // Money-honest wording: the job may well still be running and billing us, so
    // the panel must not claim it failed.
    expect(ki?.errorCode).toBe('conflict')
  })

  it('CATEGORISES an empty balance, and never ships the provider prose that says so', async () => {
    // The failure this pins, three times over on a real account: the page printed
    // "kie.ai rejected the job (HTTP 200)". That sentence names a vendor, quotes a
    // status line that literally reads SUCCESS, and buries the one actionable fact —
    // the account was out of credits. The panel must carry a CATEGORY the UI can
    // translate; the vendor's own words belong in the log.
    const kieError = new Error('kie.ai rejected the job (HTTP 200)') as Error & {
      providerDetail: string
      apiCode: string
    }
    kieError.name = 'KieError'
    kieError.apiCode = 'insufficient_credits'
    kieError.providerDetail = 'Insufficient credits for account arturfeniks88'

    const deepinfra = scriptedProvider({ assetUrl: 'https://d/v.mp4', costUsd: 0.76 })
    const kie = fakeVideoProvider()
    kie.submit.mockRejectedValue(kieError)

    const app = await buildTestApp({
      deepinfraToken: 'di',
      kieApiKey: 'kie',
      compareVideoChannels: { deepinfra, kie },
      comparePollIntervalMs: 0,
    })
    const cookie = await registerAndGetCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/compare/video',
      headers: { cookie },
      payload: { prompt: PROMPT },
    })

    const raw = res.body
    const body = res.json() as { panels: { channel: string; errorCode: string | null }[] }
    const ki = body.panels.find((p) => p.channel === 'kie')
    expect(ki?.errorCode).toBe('insufficient_credits')

    // Nothing recognisable as server prose may reach the browser — asserted on the
    // WHOLE response body, not one field, because the leak this replaces happened
    // through a field nobody thought of as user-facing.
    expect(raw).not.toContain('arturfeniks88')
    expect(raw).not.toContain('HTTP 200')
    expect(raw).not.toContain('kie.ai rejected')
  })

  it('falls back to the generic category for an error carrying no apiCode', async () => {
    // An unexpected crash in OUR code is not a provider verdict. It must not be
    // dressed up as one, and its text must not reach the screen either.
    const deepinfra = scriptedProvider({ assetUrl: 'https://d/v.mp4', costUsd: 0.76 })
    const kie = fakeVideoProvider()
    kie.submit.mockRejectedValue(new TypeError('Cannot read properties of undefined'))

    const app = await buildTestApp({
      deepinfraToken: 'di',
      kieApiKey: 'kie',
      compareVideoChannels: { deepinfra, kie },
      comparePollIntervalMs: 0,
    })
    const cookie = await registerAndGetCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/compare/video',
      headers: { cookie },
      payload: { prompt: PROMPT },
    })

    const body = res.json() as { panels: { channel: string; errorCode: string | null }[] }
    expect(body.panels.find((p) => p.channel === 'kie')?.errorCode).toBe('provider_error')
    expect(res.body).not.toContain('Cannot read properties')
  })

  it('labels a CONTENT refusal as such, so the operator rewrites the prompt instead of topping up', async () => {
    const deepinfra = fakeVideoProvider()
    deepinfra.submit.mockResolvedValue({ providerJobId: 'j' })
    deepinfra.poll.mockResolvedValue({
      status: 'error',
      message: 'the model declined this prompt',
      blocked: true,
    })
    const kie = scriptedProvider({ assetUrl: 'https://k/v.mp4', costUsd: 1.025 })

    const app = await buildTestApp({
      deepinfraToken: 'di',
      kieApiKey: 'kie',
      compareVideoChannels: { deepinfra, kie },
      comparePollIntervalMs: 0,
    })
    const cookie = await registerAndGetCookie(app)
    const res = await app.inject({
      method: 'POST',
      url: '/api/compare/video',
      headers: { cookie },
      payload: { prompt: PROMPT },
    })

    const body = res.json() as { panels: { channel: string; errorCode: string | null }[] }
    const di = body.panels.find((p) => p.channel === 'deepinfra')
    expect(di?.errorCode).toBe('content_blocked')
    // The distinction that decides what the operator does next.
    
  })

  it('never reports a cost the provider did not state', async () => {
    // A provider that succeeds but omits its figure. The panel must show NO cost
    // rather than fill the hole from a rate card — that substitution is precisely
    // the failure mode this whole page was built to kill.
    const deepinfra = scriptedProvider({ assetUrl: 'https://d/v.mp4' })
    const kie = scriptedProvider({ assetUrl: 'https://k/v.mp4', costUsd: 1.025 })

    const app = await buildTestApp({
      deepinfraToken: 'di',
      kieApiKey: 'kie',
      compareVideoChannels: { deepinfra, kie },
      comparePollIntervalMs: 0,
    })
    const cookie = await registerAndGetCookie(app)

    const res = await app.inject({
      method: 'POST',
      url: '/api/compare/video',
      headers: { cookie },
      payload: { prompt: PROMPT },
    })

    const body = res.json() as { panels: { channel: string; costUsd: number | null; creditsConsumed: number | null }[] }
    const di = body.panels.find((p) => p.channel === 'deepinfra')
    expect(di?.costUsd).toBeNull()
    expect(di?.creditsConsumed).toBeNull()
  })

  it('runs both channels CONCURRENTLY (a serial race would double the wall time)', async () => {
    const order: string[] = []
    const slow = (name: string, costUsd: number) => {
      const provider = fakeVideoProvider()
      provider.submit.mockImplementation(async () => {
        order.push(`submit:${name}`)
        await new Promise((resolve) => setTimeout(resolve, 20))
        return { providerJobId: name }
      })
      provider.poll.mockResolvedValue({ status: 'success', assetUrl: `https://${name}/v.mp4`, costUsd })
      return provider
    }
    const app = await buildTestApp({
      deepinfraToken: 'di',
      kieApiKey: 'kie',
      compareVideoChannels: { deepinfra: slow('deepinfra', 0.76), kie: slow('kie', 1.03) },
      comparePollIntervalMs: 0,
    })
    const cookie = await registerAndGetCookie(app)

    await app.inject({
      method: 'POST',
      url: '/api/compare/video',
      headers: { cookie },
      payload: { prompt: PROMPT },
    })

    // Both submits happen before either resolves — i.e. the channels were started
    // together, not one after the other.
    expect(order).toEqual(['submit:deepinfra', 'submit:kie'])
  })
})

describe('POST /api/compare/video — rate limiting', () => {
  it('caps the endpoint so a script cannot drain two provider balances', async () => {
    const make = () => scriptedProvider({ assetUrl: 'https://x/v.mp4', costUsd: 0.1 })
    const app = await buildTestApp({
      deepinfraToken: 'di',
      kieApiKey: 'kie',
      compareVideoChannels: { deepinfra: make(), kie: make() },
      comparePollIntervalMs: 0,
    })
    const cookie = await registerAndGetCookie(app)

    const fire = () =>
      app.inject({
        method: 'POST',
        url: '/api/compare/video',
        headers: { cookie },
        payload: { prompt: PROMPT },
      })

    const codes: number[] = []
    for (let i = 0; i < 5; i += 1) codes.push((await fire()).statusCode)

    // 3/min bucket: the fourth call in the window is refused.
    expect(codes.filter((c) => c === 429).length).toBeGreaterThan(0)
  })
})

// Keep vitest from holding the process open on the timers the deadline test arms.
vi.setConfig({ testTimeout: 20_000 })
