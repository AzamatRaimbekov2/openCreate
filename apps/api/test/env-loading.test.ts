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
import { loadConfig, loadEnvFromFile } from '../src/config'

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
})
