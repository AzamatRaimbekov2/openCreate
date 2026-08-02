// Native .env loading (ops hardening Task 1): config.ts owns a guarded
// process.loadEnvFile wrapper so `pnpm dev` / `db:migrate` work without
// manually sourcing the repo-root .env. Contract under test:
//   - explicit path loads vars into process.env
//   - ENV_FILE env var selects the file when no explicit path is given
//   - already-set real env vars always win over file values (Node semantics)
//   - a missing file is a silent no-op (prod gets env from the platform)
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { ARK_ASSET_HOST, loadConfig, loadEnvFromFile } from '../src/config'

const cleanupKeys = ['OC_TEST_FROM_FILE', 'OC_TEST_PRESET', 'ENV_FILE']

describe('loadEnvFromFile', () => {
  afterEach(() => {
    for (const key of cleanupKeys) delete process.env[key]
  })

  it('loads variables from an explicit env file path into process.env', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oc-env-'))
    const file = join(dir, '.env')
    writeFileSync(file, 'OC_TEST_FROM_FILE=hello\n')
    loadEnvFromFile(file)
    expect(process.env.OC_TEST_FROM_FILE).toBe('hello')
    rmSync(dir, { recursive: true, force: true })
  })

  it('uses ENV_FILE when no explicit path is given', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oc-env-'))
    const file = join(dir, 'custom.env')
    writeFileSync(file, 'OC_TEST_FROM_FILE=via-env-file\n')
    process.env.ENV_FILE = file
    loadEnvFromFile()
    expect(process.env.OC_TEST_FROM_FILE).toBe('via-env-file')
    rmSync(dir, { recursive: true, force: true })
  })

  it('never overrides variables already set in the real environment', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oc-env-'))
    const file = join(dir, '.env')
    writeFileSync(file, 'OC_TEST_PRESET=from-file\n')
    process.env.OC_TEST_PRESET = 'from-real-env'
    loadEnvFromFile(file)
    expect(process.env.OC_TEST_PRESET).toBe('from-real-env')
    rmSync(dir, { recursive: true, force: true })
  })

  it('is a silent no-op when the file does not exist', () => {
    expect(() => loadEnvFromFile('/definitely/not/a/real/.env')).not.toThrow()
  })
})

// Production config additions (ops hardening Tasks 5–6). Passing an explicit
// env object keeps loadConfig pure — no .env file is read in these tests.
const baseEnv = {
  RUNWARE_API_KEY: 'k',
  BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret',
}

describe('loadConfig production settings', () => {
  it('defaults trustedOrigins to the web origin', () => {
    const cfg = loadConfig({ ...baseEnv, WEB_ORIGIN: 'https://app.example.com' })
    expect(cfg.trustedOrigins).toEqual(['https://app.example.com'])
  })

  it('parses TRUSTED_ORIGINS as a comma-separated allowlist', () => {
    const cfg = loadConfig({
      ...baseEnv,
      TRUSTED_ORIGINS: 'https://a.example, https://b.example',
    })
    expect(cfg.trustedOrigins).toEqual(['https://a.example', 'https://b.example'])
  })

  it('defaults nodeEnv to development and resolves webDistPath next to the api package', () => {
    const cfg = loadConfig({ ...baseEnv })
    expect(cfg.nodeEnv).toBe('development')
    // default ../web/dist is anchored at apps/api regardless of process.cwd()
    const apiRoot = fileURLToPath(new URL('..', import.meta.url))
    expect(cfg.webDistPath).toBe(resolve(apiRoot, '../web/dist'))
  })

  it('keeps an absolute WEB_DIST_PATH as-is', () => {
    const cfg = loadConfig({ ...baseEnv, WEB_DIST_PATH: '/srv/web-dist' })
    expect(cfg.webDistPath).toBe('/srv/web-dist')
  })

  // SSRF allowlist for provider asset downloads (review finding): the storage
  // layer only fetches hosts on this list — runware.ai by default, override
  // via ASSET_HOST_ALLOWLIST for a future provider/CDN change without code.
  it('defaults assetHostAllowlist to runware.ai', () => {
    const cfg = loadConfig({ ...baseEnv })
    expect(cfg.assetHostAllowlist).toEqual(['runware.ai'])
  })

  it('parses ASSET_HOST_ALLOWLIST as a comma-separated host suffix list', () => {
    const cfg = loadConfig({
      ...baseEnv,
      ASSET_HOST_ALLOWLIST: 'runware.ai, assets.example.com',
    })
    expect(cfg.assetHostAllowlist).toEqual(['runware.ai', 'assets.example.com'])
  })

  // Asset download limits (review finding): saveFromUrl gets a hard deadline
  // and a size cap so a stalled or oversized provider stream can neither hang
  // a settlement forever nor fill the disk. Env-tunable, safe defaults.
  it('defaults asset download limits to 120s timeout and 512MB cap', () => {
    const cfg = loadConfig({ ...baseEnv })
    expect(cfg.assetFetchTimeoutMs).toBe(120_000)
    expect(cfg.assetMaxBytes).toBe(512 * 1024 * 1024)
  })

  it('parses ASSET_FETCH_TIMEOUT_MS and ASSET_MAX_BYTES overrides', () => {
    const cfg = loadConfig({
      ...baseEnv,
      ASSET_FETCH_TIMEOUT_MS: '5000',
      ASSET_MAX_BYTES: '1048576',
    })
    expect(cfg.assetFetchTimeoutMs).toBe(5000)
    expect(cfg.assetMaxBytes).toBe(1048576)
  })

  // TRUST_PROXY (review finding): without it, req.ip behind the documented
  // reverse proxy (PROD.md) is always the proxy's loopback address, so every
  // user shares ONE rate-limit bucket — 10 cheap requests/min lock all users
  // out of sign-in. Default-deny: proxy headers are NOT trusted unless the
  // operator explicitly opts in (direct-exposure deploys must never honor a
  // client-forged X-Forwarded-For).
  it('defaults trustProxy to false — proxy headers are never trusted implicitly', () => {
    const cfg = loadConfig({ ...baseEnv })
    expect(cfg.trustProxy).toBe(false)
  })

  it('parses TRUST_PROXY=true as boolean trust (proxy must overwrite X-Forwarded-For)', () => {
    const cfg = loadConfig({ ...baseEnv, TRUST_PROXY: 'true' })
    expect(cfg.trustProxy).toBe(true)
  })

  it('treats TRUST_PROXY=false and empty as no trust', () => {
    expect(loadConfig({ ...baseEnv, TRUST_PROXY: 'false' }).trustProxy).toBe(false)
    expect(loadConfig({ ...baseEnv, TRUST_PROXY: '' }).trustProxy).toBe(false)
  })

  it('passes a TRUST_PROXY address/CIDR list through for fastify verbatim', () => {
    const cfg = loadConfig({ ...baseEnv, TRUST_PROXY: '127.0.0.1,10.0.0.0/8' })
    expect(cfg.trustProxy).toBe('127.0.0.1,10.0.0.0/8')
  })

  // TRUST_PROXY as a HOP COUNT (ADR railway-deployment R3). On a managed
  // platform there is no address to allowlist — the edge's internal IP is not
  // knowable or stable — and the other two forms are both wrong there:
  // unset puts every user in ONE rate-limit bucket (the edge's address), and
  // `true` trusts the LEFTMOST X-Forwarded-For entry, which a client can forge
  // outright if the edge APPENDS rather than overwrites. A hop count is the
  // form that fits: proxy-addr walks the chain from the socket peer inward and
  // stops after N hops, so exactly the edge's own contribution is trusted and
  // anything the client prepended is ignored.
  it('parses a numeric TRUST_PROXY as a fastify hop count', () => {
    expect(loadConfig({ ...baseEnv, TRUST_PROXY: '1' }).trustProxy).toBe(1)
    expect(loadConfig({ ...baseEnv, TRUST_PROXY: ' 2 ' }).trustProxy).toBe(2)
  })

  it('keeps non-numeric and negative TRUST_PROXY values as address lists, not hop counts', () => {
    // '10.0.0.1' must NOT become a number — it is an address, and proxy-addr
    // reads the two forms completely differently.
    expect(loadConfig({ ...baseEnv, TRUST_PROXY: '10.0.0.1' }).trustProxy).toBe('10.0.0.1')
    expect(loadConfig({ ...baseEnv, TRUST_PROXY: 'loopback' }).trustProxy).toBe('loopback')
    expect(loadConfig({ ...baseEnv, TRUST_PROXY: '-1' }).trustProxy).toBe('-1')
    expect(loadConfig({ ...baseEnv, TRUST_PROXY: '1.5' }).trustProxy).toBe('1.5')
  })

  // PORT (ADR railway-deployment R2). Managed platforms inject PORT and expect
  // the process to listen on it; this app has always read API_PORT. Honouring
  // both — API_PORT first, since an operator who sets it means it — removes a
  // failure mode that presents as a 502 in front of a perfectly healthy
  // container.
  it('defaults the port to 8787 when neither API_PORT nor PORT is set', () => {
    expect(loadConfig({ ...baseEnv }).port).toBe(8787)
  })

  it('falls back to the platform-injected PORT when API_PORT is absent', () => {
    expect(loadConfig({ ...baseEnv, PORT: '3000' }).port).toBe(3000)
  })

  it('lets an explicit API_PORT win over an injected PORT', () => {
    expect(loadConfig({ ...baseEnv, API_PORT: '8787', PORT: '3000' }).port).toBe(8787)
  })

  // wan-runpod self-host provider (ADR: wan-selfhost-video-provider). The pod's
  // ComfyUI base URL is optional so the app boots without it (the wan-2-2 model
  // is listed but a submit returns a clean provider_error). When set, the pod's
  // /view host must be auto-added to the SSRF allowlist so saveFromUrl can
  // download the finished mp4 — env-driven so a pod change is one env edit.
  it('defaults comfyBaseUrl to null when COMFY_BASE_URL is unset', () => {
    const cfg = loadConfig({ ...baseEnv })
    expect(cfg.comfyBaseUrl).toBeNull()
    expect(cfg.assetHostAllowlist).toEqual(['runware.ai'])
  })

  it('parses COMFY_BASE_URL and adds its host to the asset allowlist', () => {
    const cfg = loadConfig({
      ...baseEnv,
      COMFY_BASE_URL: 'https://pod123-8188.proxy.runpod.net',
    })
    expect(cfg.comfyBaseUrl).toBe('https://pod123-8188.proxy.runpod.net')
    expect(cfg.assetHostAllowlist).toContain('runware.ai')
    expect(cfg.assetHostAllowlist).toContain('pod123-8188.proxy.runpod.net')
  })

  it('does not duplicate the comfy host if it is already on the allowlist', () => {
    const cfg = loadConfig({
      ...baseEnv,
      COMFY_BASE_URL: 'https://pod123-8188.proxy.runpod.net',
      ASSET_HOST_ALLOWLIST: 'runware.ai, pod123-8188.proxy.runpod.net',
    })
    const occurrences = cfg.assetHostAllowlist.filter((h) => h === 'pod123-8188.proxy.runpod.net')
    expect(occurrences).toHaveLength(1)
  })
})

// Direct ByteDance channel (ADR: seedance-direct-bytedance). Same optional-provider
// contract as COMFY_BASE_URL: unset keeps boot healthy and hides the model, set
// lights it up AND opens exactly the one download host it needs.
describe('ARK_API_KEY (direct ByteDance provider)', () => {
  it('defaults arkApiKey to null and keeps the ByteDance asset host OFF the allowlist', () => {
    const cfg = loadConfig({ ...baseEnv })
    expect(cfg.arkApiKey).toBeNull()
    // Default-deny: an unconfigured provider must not widen the SSRF surface.
    expect(cfg.assetHostAllowlist).not.toContain(ARK_ASSET_HOST)
  })

  it('treats an EMPTY ARK_API_KEY as not configured (mirrors COMFY_BASE_URL)', () => {
    // `.env` ships the key commented/blank; '' must mean "off", not "a blank key"
    // — otherwise boot would register a provider that 401s on every call.
    const cfg = loadConfig({ ...baseEnv, ARK_API_KEY: '' })
    expect(cfg.arkApiKey).toBeNull()
    expect(cfg.assetHostAllowlist).not.toContain(ARK_ASSET_HOST)
  })

  it('adds ByteDance’s TOS asset host — NOT its API host — when the key is set', () => {
    const cfg = loadConfig({ ...baseEnv, ARK_API_KEY: 'ark-key' })
    expect(cfg.arkApiKey).toBe('ark-key')
    // The API answers on *.bytepluses.com but publishes finished videos to
    // ByteDance's TOS object storage on *.volces.com. Allowlisting the API domain
    // would pass the gate for zero real downloads and fail every actual one.
    expect(cfg.assetHostAllowlist).toContain(ARK_ASSET_HOST)
    expect(cfg.assetHostAllowlist.some((h) => h.endsWith('bytepluses.com'))).toBe(false)
    expect(cfg.assetHostAllowlist).toContain('runware.ai')
  })

  it('composes with the comfy host rather than replacing it', () => {
    const cfg = loadConfig({
      ...baseEnv,
      ARK_API_KEY: 'ark-key',
      COMFY_BASE_URL: 'https://pod123-8188.proxy.runpod.net',
    })
    expect(cfg.assetHostAllowlist).toEqual(
      expect.arrayContaining(['runware.ai', 'pod123-8188.proxy.runpod.net', ARK_ASSET_HOST]),
    )
  })
})
