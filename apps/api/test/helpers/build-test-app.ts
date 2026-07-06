// Test-only factory: builds the API app with an in-memory config so every test
// gets an isolated instance (no env vars, no real Runware key, no disk DB).
// This helper grows alongside AppDeps over plan Tasks 3→6.
import { buildApp } from '../../src/app'
import { createDb } from '../../src/db/client'

export async function buildTestApp() {
  return buildApp({
    // Fresh in-memory db per app: tests are fully isolated from each other.
    db: createDb(':memory:').db,
    config: {
      databasePath: ':memory:',
      storageDir: './data/test-media',
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
