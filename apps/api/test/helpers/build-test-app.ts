// Test-only factory: builds the API app with an in-memory config so every test
// gets an isolated instance (no env vars, no real Runware key, no disk DB).
// This helper grows alongside AppDeps over plan Tasks 3→10.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildApp } from '../../src/app'
import { createDb } from '../../src/db/client'
import { createLocalStorage } from '../../src/storage/local'

export type TestAppOverrides = {
  // Task 9: point /media serving at a caller-owned temp dir so tests can put
  // files in it / assert on it. Default: a fresh mkdtemp per app.
  storageDir?: string
  // Task 10 will add: runware?, signupBonusCredits?
}

export async function buildTestApp(overrides: TestAppOverrides = {}) {
  const storageDir = overrides.storageDir ?? mkdtempSync(join(tmpdir(), 'oc-test-media-'))
  return buildApp({
    // Fresh in-memory db per app: tests are fully isolated from each other.
    db: createDb(':memory:').db,
    storage: createLocalStorage(storageDir),
    config: {
      databasePath: ':memory:',
      storageDir,
      runwareApiKey: 'test-key',
      betterAuthSecret: 'test-secret-test-secret-test-secret',
      betterAuthUrl: 'http://localhost:8787',
      webOrigin: 'http://localhost:5173',
      signupBonusCredits: 200,
      port: 0,
      googleClientId: null,
      googleClientSecret: null,
    },
  })
}
