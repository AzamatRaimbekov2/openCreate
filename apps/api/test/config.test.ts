// R2 config validation (ADR railway-deployment D2 — see storage/r2.ts for the
// provider these fields configure). Every other env field already has
// coverage indirectly via buildTestApp; this file exists for R2's cross-field
// rule, which zod's schema can't express on its own.
import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config'

// The minimum env loadConfig accepts without throwing on an UNRELATED field —
// mirrors buildTestApp's config so a failure here is provably about R2.
const BASE_ENV = {
  RUNWARE_API_KEY: 'test-key',
  BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret',
}

const FULL_R2_ENV = {
  R2_ENDPOINT: 'https://acct.r2.cloudflarestorage.com',
  R2_BUCKET: 'opencreate-media',
  R2_ACCESS_KEY_ID: 'ak',
  R2_SECRET_ACCESS_KEY: 'sk',
  R2_PUBLIC_BASE_URL: 'https://media.example.com',
}

describe('R2 config', () => {
  it('r2 is null when no R2_* vars are set', () => {
    expect(loadConfig(BASE_ENV).r2).toBeNull()
  })

  it('r2 is populated when all five vars are set', () => {
    expect(loadConfig({ ...BASE_ENV, ...FULL_R2_ENV }).r2).toEqual({
      endpoint: FULL_R2_ENV.R2_ENDPOINT,
      bucket: FULL_R2_ENV.R2_BUCKET,
      accessKeyId: FULL_R2_ENV.R2_ACCESS_KEY_ID,
      secretAccessKey: FULL_R2_ENV.R2_SECRET_ACCESS_KEY,
      publicBaseUrl: FULL_R2_ENV.R2_PUBLIC_BASE_URL,
    })
  })

  it('throws at boot when only some R2_* vars are set', () => {
    expect(() => loadConfig({ ...BASE_ENV, R2_ENDPOINT: FULL_R2_ENV.R2_ENDPOINT })).toThrow(
      /must be set together/,
    )
  })

  it('throws when all but one R2_* var is set', () => {
    const rest: Record<string, string> = { ...FULL_R2_ENV }
    delete rest.R2_PUBLIC_BASE_URL
    expect(() => loadConfig({ ...BASE_ENV, ...rest })).toThrow(/must be set together/)
  })
})

// ── Provider asset hosts ────────────────────────────────────────────────────
// A download host is the last gate between a paid, finished render and the user,
// and it fails in the worst possible order: the provider bills us, the clip
// exists, and THEN storage.saveFromUrl refuses the host and the row settles as a
// 500. Production produced exactly that on 2026-08-20 — «asset host not allowed:
// images.segmind.com» on a Seedance 2.0 clip that had already rendered.
//
// The constant was an honest documented guess (their 404 body names
// api.segmind.com as the output endpoint) with an instruction attached: read the
// real host off the adapter's `segmind.asset_host` log line and add it. This is
// that instruction being carried out, pinned so the next widening needs evidence
// too.
describe('provider asset hosts', () => {
  it('allows the Segmind CDN that production actually serves clips from', () => {
    const { assetHostAllowlist } = loadConfig({ ...BASE_ENV, SEGMIND_API_KEY: 'sg-key' })
    expect(assetHostAllowlist).toContain('images.segmind.com')
  })

  it('keeps the Segmind API host too — the v1 output endpoint lives there', () => {
    const { assetHostAllowlist } = loadConfig({ ...BASE_ENV, SEGMIND_API_KEY: 'sg-key' })
    expect(assetHostAllowlist).toContain('api.segmind.com')
  })

  it('folds in NEITHER host when the channel is unconfigured', () => {
    // The download surface stays closed by default: an unconfigured provider
    // cannot be the reason an arbitrary host becomes fetchable.
    const { assetHostAllowlist } = loadConfig(BASE_ENV)
    expect(assetHostAllowlist).not.toContain('images.segmind.com')
    expect(assetHostAllowlist).not.toContain('api.segmind.com')
  })

  it('folds in the kie CDN when that channel is configured, and not otherwise', () => {
    expect(loadConfig({ ...BASE_ENV, KIE_API_KEY: 'k' }).assetHostAllowlist).toContain(
      'tempfile.aiquickdraw.com',
    )
    expect(loadConfig(BASE_ENV).assetHostAllowlist).not.toContain('tempfile.aiquickdraw.com')
  })
})
