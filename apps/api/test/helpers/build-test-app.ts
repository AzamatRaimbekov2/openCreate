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
import { createLocalStorage } from '../../src/storage/local'

// Fully-mocked RunwareClient (plan Task 10): each test scripts the provider's
// behavior per method, and can assert calls (e.g. "no runware call on 402").
export const fakeRunware = () => ({
  imageInference: vi.fn(),
  submitVideo: vi.fn(),
  getResponse: vi.fn(),
})

export type TestAppOverrides = {
  // Task 9: point /media serving at a caller-owned temp dir so tests can put
  // files in it / assert on it. Default: a fresh mkdtemp per app.
  storageDir?: string
  // Task 10: scripted provider + a lowered signup bonus for 402 tests.
  runware?: RunwareClient
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
}

export async function buildTestApp(overrides: TestAppOverrides = {}) {
  const storageDir = overrides.storageDir ?? mkdtempSync(join(tmpdir(), 'oc-test-media-'))
  return buildApp({
    // Fresh in-memory db per app: tests are fully isolated from each other.
    db: createDb(':memory:').db,
    storage: createLocalStorage(storageDir),
    runware: overrides.runware ?? (fakeRunware() as unknown as RunwareClient),
    ...(overrides.logStream ? { logStream: overrides.logStream } : {}),
    config: {
      databasePath: ':memory:',
      storageDir,
      runwareApiKey: 'test-key',
      betterAuthSecret: 'test-secret-test-secret-test-secret',
      betterAuthUrl: 'http://localhost:8787',
      webOrigin: 'http://localhost:5173',
      signupBonusCredits: overrides.signupBonusCredits ?? 200,
      port: 0,
      googleClientId: null,
      googleClientSecret: null,
      logLevel: overrides.logLevel ?? 'silent',
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
