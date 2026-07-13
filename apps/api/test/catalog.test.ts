// Task 7 tests: the curated model catalog is the single source of truth for
// model ids, AIR ids and credit pricing. Every entry must satisfy the shared
// contract schema, and creditsFor must be exact about duration pricing.
import { describe, expect, it } from 'vitest'
import { catalogModelSchema } from '@opencreate/contracts'
import { CATALOG, creditsFor, getModel, resolutionFor } from '../src/modules/catalog/catalog'
import { buildTestApp } from './helpers/build-test-app'

describe('catalog', () => {
  it('every entry passes the contract schema', () => {
    for (const m of CATALOG) expect(catalogModelSchema.safeParse(m).success).toBe(true)
  })
  it('creditsFor image ignores duration', () => {
    expect(creditsFor(getModel('flux-schnell')!, undefined)).toBe(1)
  })
  it('creditsFor video uses duration table', () => {
    expect(creditsFor(getModel('pixverse-v6')!, 5)).toBe(35)
  })
  it('creditsFor video with unsupported duration throws', () => {
    expect(() => creditsFor(getModel('pixverse-v6')!, 99)).toThrow()
  })
  it('offers Seedance 1.5 Pro (AIR verified live 2026-07-07) in the standard tier with i2v', () => {
    const m = getModel('seedance-1-5-pro')
    expect(m).toBeDefined()
    expect(m!.air).toBe('bytedance:seedance@1.5-pro')
    expect(m!.supportsImageInput).toBe(true)
    expect(creditsFor(m!, 5)).toBe(35)
    expect(creditsFor(m!, 10)).toBe(70)
  })
})

describe('GET /api/catalog', () => {
  // The rule the route implements: a video model is listed only when the backend
  // that runs it is configured. Runware is always on; wan-runpod needs
  // COMFY_BASE_URL, bytedance needs ARK_API_KEY, and alibaba needs BOTH
  // DASHSCOPE_API_KEY and DASHSCOPE_WORKSPACE_ID (its workspace id lives in the
  // request host, so config nulls the pair together). Listing a model whose
  // backend cannot run is worse than omitting it — it is a selectable option that
  // walks the user all the way to submit and only then fails.
  // 'deepinfra' joined the list when Seedance 2.0 moved off the direct ByteDance
  // channel: that one refuses to run until the account buys a resource pack, so
  // the row was listed and dead. DeepInfra runs the same model at the same price
  // with no pack — but only once DEEPINFRA_TOKEN exists, hence the gate.
  //
  // 'bytedance' stays in the list even though NO catalog model uses it today: the
  // provider is still registered and still tested (ark-client.test.ts), and the
  // gate must keep working for the day the pack is bought and `provider` flips back.
  const optionalProviders = ['wan-runpod', 'bytedance', 'alibaba', 'deepinfra']

  it('is public and lists only Runware models when both optional backends are off', async () => {
    // buildTestApp defaults comfyBaseUrl AND arkApiKey to null.
    const app = await buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/api/catalog' })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { models: Array<{ provider?: string }> }
    const expected = CATALOG.filter(
      (m) => m.type !== 'video' || !optionalProviders.includes(m.provider ?? 'runware'),
    )
    expect(body.models).toHaveLength(expected.length)
    for (const p of optionalProviders)
      expect(body.models.some((m) => m.provider === p)).toBe(false)
    for (const m of body.models) expect(catalogModelSchema.safeParse(m).success).toBe(true)
  })

  it('lists wan-runpod models when self-host IS configured (and still hides the rest)', async () => {
    const app = await buildTestApp({ comfyBaseUrl: 'https://pod-8188.proxy.runpod.net' })
    const res = await app.inject({ method: 'GET', url: '/api/catalog' })
    const body = res.json() as { models: Array<{ provider?: string }> }
    expect(body.models.some((m) => m.provider === 'wan-runpod')).toBe(true)
    // Each backend is gated by its OWN env: turning the pod on must not smuggle in
    // a model whose provider key is still absent.
    expect(body.models.some((m) => m.provider === 'deepinfra')).toBe(false)
    expect(body.models.some((m) => m.provider === 'alibaba')).toBe(false)
  })

  it('lists Seedance 2.0 only when DEEPINFRA_TOKEN IS configured', async () => {
    const off = await buildTestApp()
    const offBody = (await off.inject({ method: 'GET', url: '/api/catalog' })).json() as {
      models: Array<{ id: string }>
    }
    expect(offBody.models.some((m) => m.id === 'seedance-2-0')).toBe(false)

    const on = await buildTestApp({ deepinfraToken: 'di-key' })
    const onBody = (await on.inject({ method: 'GET', url: '/api/catalog' })).json() as {
      models: Array<{ id: string; provider?: string }>
    }
    const seedance = onBody.models.find((m) => m.id === 'seedance-2-0')
    expect(seedance?.provider).toBe('deepinfra')
    expect(onBody.models.some((m) => m.provider === 'wan-runpod')).toBe(false)
  })

  // ARK_API_KEY still gates the bytedance provider even though no catalog model
  // uses it right now. Seedance 2.0 sat behind that key and never ran — the direct
  // channel refuses until a resource pack is bought — so the row moved to
  // DeepInfra. The gate must survive the move: flipping `provider` back the day the
  // pack is bought has to keep working, and a key that gates nothing must not
  // accidentally start listing something.
  it('ARK_API_KEY alone lists nothing (no catalog model routes to bytedance today)', async () => {
    const app = await buildTestApp({ arkApiKey: 'ark-key' })
    const body = (await app.inject({ method: 'GET', url: '/api/catalog' })).json() as {
      models: Array<{ id: string; provider?: string }>
    }
    expect(body.models.some((m) => m.provider === 'bytedance')).toBe(false)
    expect(body.models.some((m) => m.id === 'seedance-2-0')).toBe(false)
  })

  it('lists every model when every optional backend is configured', async () => {
    const app = await buildTestApp({
      comfyBaseUrl: 'https://pod-8188.proxy.runpod.net',
      arkApiKey: 'ark-key',
      dashscopeApiKey: 'ds-key',
      dashscopeWorkspaceId: 'ws-1',
      deepinfraToken: 'di-key',
    })
    const res = await app.inject({ method: 'GET', url: '/api/catalog' })
    const body = res.json() as { models: Array<{ provider?: string }> }
    expect(body.models).toHaveLength(CATALOG.length)
  })
})

describe('nano-banana-pro — the reference/character model', () => {
  const m = getModel('nano-banana-pro')

  it('is a Runware image model that conditions on references (faces AND subjects)', () => {
    expect(m).toBeDefined()
    expect(m!.type).toBe('image')
    expect(m!.air).toBe('google:4@2')
    expect(m!.referenceMode).toBe('both')
    expect(m!.maxReferenceImages).toBe(14)
  })

  it('reads its OWN dimension table — the default one would earn a provider 400', () => {
    // Nano Banana rejects sizes outside its published list, exactly like Kontext.
    // square1024's 1344×768 is NOT on that list.
    expect(m!.resolutionProfile).toBe('nanobanana')
    expect(resolutionFor(m!, '16:9')).toEqual({ width: 1376, height: 768 })
    expect(resolutionFor(m!, '1:1')).toEqual({ width: 1024, height: 1024 })
    expect(resolutionFor(m!, '9:16')).toEqual({ width: 768, height: 1376 })
  })

  it('is priced above wholesale ($0.138/image at 1K)', () => {
    expect(m!.type === 'image' && m!.credits).toBeGreaterThan(14)
  })
})

// THE load-bearing architectural invariant of the ByteDance integration.
// Seedance 2.0 refuses real human faces on input, and Nano Banana is a Google
// model — ByteDance trusts ONLY ModelArk's own outputs, so switching the image
// model from Flux to Nano Banana does NOT unlock faces on Seedance 2.0.
// The protection is the capability flag: a model with no `referenceMode` is
// filtered out of the picker the moment an entity is tagged, and the API
// re-validates. If someone ever "helpfully" adds referenceMode to seedance-2-0,
// this test is what stops a class of silently-refused, credit-burning generations.
describe('face policy — Seedance 2.0 must never be reference-capable', () => {
  it('seedance-2-0 declares NO referenceMode, so a tagged entity can never route to it', () => {
    const m = getModel('seedance-2-0')!
    expect(m.referenceMode).toBeFalsy()
  })

  it('the reference-capable models are exactly those that accept real faces', () => {
    // Every model offered once a character is tagged must be one whose provider
    // has no real-face policy. ByteDance-backed models must not appear here.
    const referenceCapable = CATALOG.filter((m) => m.referenceMode)
    expect(referenceCapable.length).toBeGreaterThan(0)
    for (const m of referenceCapable)
      expect(m.type === 'video' && m.provider === 'bytedance').toBe(false)
  })
})

describe('seedance 2.0 — routed through DeepInfra, not the blocked direct channel', () => {
  const m = getModel('seedance-2-0')

  // The direct ByteDance channel answers `ModelNotOpen` and renders nothing until
  // the account buys a resource pack — $30.10 minimum, 90-day expiry,
  // non-refundable, and not purchasable in their console at all. This row was
  // listed and dead. DeepInfra runs the SAME model at the SAME price with no pack.
  it('routes to the deepinfra provider (the direct ByteDance channel needs a paid pack)', () => {
    expect(m).toBeDefined()
    expect(m!.type === 'video' && m!.provider).toBe('deepinfra')
  })

  it("carries DeepInfra's PATH-shaped model id behind the synthetic AIR prefix", () => {
    // Their ids are paths, not slugs — which is why the shared AIR regex now admits
    // `/`. The `deepinfra:` half is ours and the adapter strips it.
    expect(m!.air).toBe('deepinfra:ByteDance/Seedance-2.0')
  })

  // Same model, same manufacturer, same policy: the 2.0 series refuses any input
  // image containing a real human face. Reselling it does not relax that, so the
  // routing rule that keeps character shots away from it still stands.
  it('still declares no referenceMode — a tagged character must never route here', () => {
    expect(m!.referenceMode ?? null).toBeNull()
  })

  it('is pinned to the 720p (hd) table so a premium tier cannot silently buy 1080p', () => {
    // Wholesale is $0.756/5s at 720p but $1.87/5s at 1080p. Without this pin the
    // 'premium' tier would read the fhd table and multiply our cost by ~2.5×.
    expect(m!.resolutionProfile).toBe('hd')
  })

  it('is priced above wholesale — the 35-credit standard tier would sell at a loss', () => {
    // 5s 720p costs $0.756 (108k tokens × $0.0070/1k, the no-video-input rate).
    // 1 credit = $0.01, so anything at or below 76 credits loses money per clip.
    expect(creditsFor(m!, 5)).toBeGreaterThan(76)
    expect(creditsFor(m!, 10)).toBe(creditsFor(m!, 5) * 2)
  })
})

describe('provider parameter compatibility', () => {
  it('seedance rejects the runware safety param — catalog must flag it off', () => {
    expect(getModel('seedance-1-5-pro')!.type === 'video' && getModel('seedance-1-5-pro')).toMatchObject({
      supportsSafetyParam: false,
    })
  })
})

describe('3D models', () => {
  it('ships three model3d tiers and every one validates against the contract', () => {
    const models3d = CATALOG.filter((m) => m.type === 'model3d')
    expect(models3d).toHaveLength(3)
    for (const m of models3d) expect(catalogModelSchema.parse(m)).toEqual(m)
  })

  it('prices every 3D model at roughly 2x its provider cost', () => {
    // TRELLIS.2 $0.0256, Hunyuan Rapid $0.225, Tripo v3.1 $0.40 (research 2026-07-11).
    expect(creditsFor(getModel('trellis-2')!)).toBe(6)
    expect(creditsFor(getModel('hunyuan-3d-rapid')!)).toBe(45)
    expect(creditsFor(getModel('tripo-3d')!)).toBe(80)
  })

  it('marks every 3D model as accepting an image input', () => {
    // A 3D model with supportsImageInput:false could never be generated from a
    // photo — which is the entire product.
    for (const m of CATALOG.filter((m) => m.type === 'model3d')) {
      expect(m.supportsImageInput).toBe(true)
    }
  })
})
