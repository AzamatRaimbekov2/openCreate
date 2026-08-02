// Test-only factory: builds the API app with an in-memory config so every test
// gets an isolated instance (no env vars, no real Runware key, no disk DB).
// This helper grows alongside AppDeps over plan Tasks 3→10.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { vi } from 'vitest'
import { buildApp } from '../../src/app'
import { createDb } from '../../src/db/client'
import type { RunwareClient } from '../../src/integrations/runware/client'
import type { VideoProvider, VideoProviderId } from '../../src/integrations/video-provider'
import type { Mesh3dProvider } from '../../src/integrations/mesh-provider'
import { createLocalStorage } from '../../src/storage/local'

// Fully-mocked RunwareClient (plan Task 10): each test scripts the provider's
// behavior per method, and can assert calls (e.g. "no runware call on 402").
export const fakeRunware = () => ({
  imageInference: vi.fn(),
  submitVideo: vi.fn(),
  // CinemaStudio audio submit (audioInference). Present on the fake so the
  // RunwareClient type is satisfied; audio tests script it per case.
  submitAudio: vi.fn(),
  // Studio3D image→3D submit (3dInference). Same reason as submitAudio: the fake
  // must satisfy the full RunwareClient type; the 3D tests script it per case.
  submit3d: vi.fn(),
  getResponse: vi.fn(),
})

// Fully-mocked VideoProvider (wan-runpod seam): each test scripts submit/poll
// and asserts which provider the service routed to.
export const fakeVideoProvider = () => ({
  submit: vi.fn(),
  poll: vi.fn(),
})

// Fully-mocked Mesh3dProvider (Studio3D seam). Identical shape to the video fake
// because the seam is identical — two calls, and a poll union that is the SAME
// neutral type. Tests script submit/poll and assert a 3D job never reached the
// video registry.
export const fakeMeshProvider = () => ({
  submit: vi.fn(),
  poll: vi.fn(),
})

export type TestAppOverrides = {
  // Share one db across two buildTestApp calls — the dev-admin idempotence test
  // boots "the same database" twice, which a fresh :memory: per app can't model.
  // Default: a fresh isolated :memory: db, as always.
  db?: ReturnType<typeof createDb>['db']
  // Task 9: point /media serving at a caller-owned temp dir so tests can put
  // files in it / assert on it. Default: a fresh mkdtemp per app.
  storageDir?: string
  // Task 10: scripted provider + a lowered signup bonus for 402 tests.
  runware?: RunwareClient
  // VideoProvider seam: override entries of the video provider registry to assert
  // routing. PARTIAL — buildApp derives the full registry (runware adapter +
  // wan-runpod comfy + bytedance ark) and merges these on top, so a routing test
  // stubs only the backends it actually asserts on.
  videoProviders?: Partial<Record<VideoProviderId, VideoProvider>>
  // Mesh3dProvider seam (Studio3D). NOT partial like videoProviders: only the
  // runware backend is built ('comfy-3d' is a designed-but-unbuilt self-host
  // seam), so 3D routing is a single adapter rather than a registry. Absent →
  // buildApp derives the runware mesh adapter, so suites that never touch 3D are
  // byte-for-byte unaffected.
  meshProvider?: Mesh3dProvider
  signupBonusCredits?: number
  // Ops hardening: logger is SILENT by default so suites stay quiet; logging
  // tests raise the level and capture pino's NDJSON via a write stub.
  logLevel?: import('../../src/config').LogLevel
  logStream?: { write: (msg: string) => void }
  // Ops hardening: production single-origin serving (static-web tests point
  // webDistPath at a fixture dist) and better-auth trusted origins.
  nodeEnv?: string
  webDistPath?: string
  trustedOrigins?: string[]
  // Reverse-proxy header trust (TRUST_PROXY): rate-limit tests flip this to
  // pin per-forwarded-client buckets vs the default deny (header ignored).
  trustProxy?: boolean | string
  // SSRF allowlist for storage.saveFromUrl AND config. Default ['runware.ai'];
  // wan-runpod routing tests widen it to the pod /view host (mirrors the
  // production config, which auto-adds the COMFY_BASE_URL host).
  assetHostAllowlist?: string[]
  // Poll throttle seam. Tests default to 0 (disabled) because many suites
  // deliberately script back-to-back polls of one generation (processing →
  // succeeded etc.) and must see Runware answer each step; the throttle's own
  // tests opt in with a real interval. Production keeps the service's 3s
  // default (pinned by a service-level test in generations-poll-throttle).
  pollMinIntervalMs?: number
  // Self-host on/off: default null (off). Set to a URL so the catalog route
  // lists the wan-runpod (self-host) models — a listed model whose backend is
  // unconfigured is only a broken option, so /api/catalog hides them when off.
  comfyBaseUrl?: string | null
  // Direct ByteDance on/off: default null (off), same contract as comfyBaseUrl —
  // set a key so /api/catalog lists the bytedance-backed Seedance models.
  arkApiKey?: string | null
  // Direct Alibaba (DashScope) on/off: default null (off). Unlike the other two
  // this is a PAIR — the workspace id lives in the request host, so config treats
  // key-without-workspace as unconfigured. Setting both lists the alibaba models.
  dashscopeApiKey?: string | null
  dashscopeWorkspaceId?: string | null
  // DeepInfra on/off: default null (off), same contract as the others — the
  // catalog hides seedance-2-0 until a token exists, so a test that wants it must
  // say so. Also the prompt enhancer's PRIMARY LLM.
  deepinfraToken?: string | null
  // Groq on/off: default null (off). The prompt enhancer's FREE fallback LLM; the
  // enhancer HTTP tests keep both this and deepinfraToken null so the endpoint
  // answers provider_error (success is a service-level test with an injected chain).
  groqApiKey?: string | null
  // kie.ai on/off: default null (off), so the third Seedance channel's catalog models
  // stay hidden and no suite can reach a real balance by accident. A routing test that
  // asserts the channel is LISTED sets this to a dummy string.
  kieApiKey?: string | null
  // Segmind on/off: default null (off), same contract as the others.
  segmindApiKey?: string | null
  // Modular 3D Assets analyze (ADR modular-3d-assets): the Claude-vision part
  // suggestion gates on this key exactly like storyboard. Default null → the
  // /analyze route answers 502 provider_error (the wizard still works by hand),
  // which is what the HTTP suite pins. A future test can flip it, but analyze
  // SUCCESS stays a service-level test (there is no Anthropic HTTP fake).
  anthropicApiKey?: string | null
  // Google OAuth on/off (ADR google-oauth): both default null → provider
  // disabled, and GET /api/auth/config reports googleEnabled:false. Setting BOTH
  // enables the better-auth Google provider and flips the public config flag.
  googleClientId?: string | null
  googleClientSecret?: string | null
  // openCreator's brain chain (ADR opencreator-agent). Absent → derived from the
  // two (null-by-default) LLM keys, i.e. an EMPTY chain, so a suite that never
  // touches /creator is unaffected and a turn would answer provider_error.
  //
  // The creator HTTP suite injects a SCRIPTED brain instead: asserting "the
  // budget gate refused this generation" must not depend on what a real model
  // decides to do, and no test may hit Anthropic or DeepInfra. The generation
  // path underneath stays real (fakeRunware + the real ledger), which is what
  // makes "no provider call, balance unchanged" meaningful evidence.
  creatorBrains?: import('../../src/modules/creator/brain').Brain[]
  // /compare-video channels (hidden Seedance 2.0 cost page). Scripted here for the
  // same reason the creator brains are: the endpoint's real backends bill actual
  // money per call, and a suite that spends $1.50 to re-learn a known price is a
  // recurring tax on running the tests.
  compareVideoChannels?: { deepinfra?: VideoProvider; kie?: VideoProvider; segmind?: VideoProvider }
  // Poll cadence / deadline for that page. Tests set the interval to 0 to keep the
  // loop deterministic, and shrink the deadline to exercise the timeout branch.
  comparePollIntervalMs?: number
  compareDeadlineMs?: number
  // Which channels the cost page actually runs. Absent → both, which is what most
  // of the suite asserts; a test passes ['kie'] to pin that a parked channel is
  // never even called.
  compareChannels?: readonly ('segmind' | 'deepinfra' | 'kie')[]
}

export async function buildTestApp(overrides: TestAppOverrides = {}) {
  const storageDir = overrides.storageDir ?? mkdtempSync(join(tmpdir(), 'oc-test-media-'))
  return buildApp({
    // Fresh in-memory db per app: tests are fully isolated from each other.
    // The db override exists for the one shape isolation can't express —
    // asserting a SECOND boot over the SAME db (dev-admin seed idempotence).
    db: overrides.db ?? createDb(':memory:').db,
    storage: createLocalStorage(storageDir, overrides.assetHostAllowlist ?? ['runware.ai']),
    runware: overrides.runware ?? (fakeRunware() as unknown as RunwareClient),
    ...(overrides.videoProviders ? { videoProviders: overrides.videoProviders } : {}),
    ...(overrides.compareVideoChannels
      ? { compareVideoChannels: overrides.compareVideoChannels }
      : {}),
    ...(overrides.comparePollIntervalMs !== undefined
      ? { comparePollIntervalMs: overrides.comparePollIntervalMs }
      : {}),
    ...(overrides.compareDeadlineMs !== undefined
      ? { compareDeadlineMs: overrides.compareDeadlineMs }
      : {}),
    // BOTH by default here, deliberately unlike production (which currently runs kie
    // alone because the DeepInfra account is empty). The suite has to keep exercising
    // the full two-channel path — identical settings, failure isolation, concurrency
    // — or parking a channel for billing reasons would silently delete that coverage
    // and nobody would notice until it was restored.
    compareChannels: overrides.compareChannels ?? ['deepinfra', 'kie'],
    ...(overrides.meshProvider ? { meshProvider: overrides.meshProvider } : {}),
    ...(overrides.logStream ? { logStream: overrides.logStream } : {}),
    // Presence matters, not truthiness: `[]` is the meaningful "nothing
    // configured" case the creator suite asserts on, so it must reach buildApp
    // instead of falling back to the token-derived chain.
    ...(overrides.creatorBrains !== undefined ? { creatorBrains: overrides.creatorBrains } : {}),
    // 0 disables the poll throttle by default (see TestAppOverrides note).
    pollMinIntervalMs: overrides.pollMinIntervalMs ?? 0,
    config: {
      databasePath: ':memory:',
      storageDir,
      runwareApiKey: 'test-key',
      // DashScope (direct Wan channel): both default null → provider unconfigured,
      // its catalog models hidden (see the override note above for why it is a pair).
      dashscopeApiKey: overrides.dashscopeApiKey ?? null,
      dashscopeWorkspaceId: overrides.dashscopeWorkspaceId ?? null,
      deepinfraToken: overrides.deepinfraToken ?? null,
      // Prompt enhancer's free fallback LLM; null → dropped from the chain.
      groqApiKey: overrides.groqApiKey ?? null,
      // kie.ai Seedance channel; null → provider unconfigured, so its catalog models
      // stay hidden and no test can accidentally reach a real balance.
      kieApiKey: overrides.kieApiKey ?? null,
      segmindApiKey: overrides.segmindApiKey ?? null,
      // CinemaStudio + Modular 3D Assets config: null → no LLM-backed features in
      // tests (storyboard AND assets3d analyze both answer 502 provider_error).
      anthropicApiKey: overrides.anthropicApiKey ?? null,
      betterAuthSecret: 'test-secret-test-secret-test-secret',
      betterAuthUrl: 'http://localhost:8787',
      webOrigin: 'http://localhost:5173',
      signupBonusCredits: overrides.signupBonusCredits ?? 200,
      port: 0,
      // Google OAuth: both default null (disabled). A suite that exercises the
      // provider or the /api/auth/config flag sets BOTH (config gates on the pair).
      googleClientId: overrides.googleClientId ?? null,
      googleClientSecret: overrides.googleClientSecret ?? null,
      logLevel: overrides.logLevel ?? 'silent',
      // Matches the storage default; wan-runpod routing tests widen it to the
      // pod /view host (see the assetHostAllowlist override above).
      assetHostAllowlist: overrides.assetHostAllowlist ?? ['runware.ai'],
      // Production defaults (120s / 512MB); tests that probe the download
      // limits construct their own createLocalStorage with tight limits.
      assetFetchTimeoutMs: 120_000,
      assetMaxBytes: 512 * 1024 * 1024,
      // wan-runpod pod URL: unset by default (tests inject a fake videoProviders
      // registry rather than a live pod). Kept null so buildApp's derived comfy
      // client is present-but-unconfigured (a wan-runpod submit would 502).
      comfyBaseUrl: overrides.comfyBaseUrl ?? null,
      // Direct ByteDance key: unset by default, same rationale as comfyBaseUrl —
      // buildApp's derived ark client is present-but-unconfigured (a bytedance
      // submit would 502), and routing tests inject a fake provider instead.
      arkApiKey: overrides.arkApiKey ?? null,
      // Default-deny like production: proxy headers are only trusted when a
      // test opts in — mirrors the TRUST_PROXY env knob (unset → false).
      trustProxy: overrides.trustProxy ?? false,
      // 'test' (NOT 'production') by default: prod-only behaviors like SPA
      // serving must be opted into explicitly by the tests that pin them.
      nodeEnv: overrides.nodeEnv ?? 'test',
      webDistPath: overrides.webDistPath ?? '/nonexistent-web-dist',
      trustedOrigins: overrides.trustedOrigins ?? ['http://localhost:5173'],
    },
  })
}

// Signs up a fresh user and returns the session cookie header value ready to
// send back on subsequent injects.
export async function registerAndGetCookie(
  app: Awaited<ReturnType<typeof buildTestApp>>,
  email = 'a@b.co',
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: { email, password: 'password123', name: 'A' },
  })
  if (res.statusCode !== 200) throw new Error(`sign-up failed: ${res.statusCode} ${res.body}`)
  const setCookie = res.headers['set-cookie']
  if (!setCookie) throw new Error('sign-up did not set a session cookie')
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie]
  // Keep only the name=value pair of each cookie (drop Path/HttpOnly/… attrs).
  return cookies.map((c) => c.split(';')[0]).join('; ')
}
