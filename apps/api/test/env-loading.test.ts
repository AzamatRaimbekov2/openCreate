// Native .env loading (ops hardening Task 1): config.ts owns a guarded
// process.loadEnvFile wrapper so `pnpm dev` / `db:migrate` work without
// manually sourcing the repo-root .env. Contract under test:
//   - explicit path loads vars into process.env
//   - ENV_FILE env var selects the file when no explicit path is given
//   - already-set real env vars always win over file values (Node semantics)
//   - a missing file is a silent no-op (prod gets env from the platform)
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadEnvFromFile } from '../src/config'

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
