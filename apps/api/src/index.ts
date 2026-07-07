// Boot entry (plan Task 3): load validated env config, build the app via the DI
// composition root, and listen. Kept minimal on purpose — all wiring lives in
// app.ts so tests never import this file (it has listen() side effects).
import { buildApp } from './app'
import { loadConfig } from './config'
import { createDb } from './db/client'
import { createRunwareClient } from './integrations/runware/client'
import { createLocalStorage } from './storage/local'

const config = loadConfig()
// createDb also runs the idempotent DDL bootstrap, so a fresh checkout can boot
// even before `pnpm db:migrate` was ever run.
const { db } = createDb(config.databasePath)
// Local disk storage (mkdir -p'd on boot); assets are served back at /media/*.
// The allowlist locks server-side asset fetches to the provider's domain
// (SSRF gate — asset URLs come from provider responses, not our code). The
// limits bound every download: a hard deadline (a stalled provider stream
// must not hang a settlement forever) and a streaming byte cap (an oversized
// body must not fill the disk that also holds the SQLite database).
const storage = createLocalStorage(config.storageDir, config.assetHostAllowlist, {
  fetchTimeoutMs: config.assetFetchTimeoutMs,
  maxBytes: config.assetMaxBytes,
})
// The ONLY place the real Runware key leaves config — the client keeps it in a
// closure and never exposes it (tests always inject a fake instead).
const runware = createRunwareClient({ apiKey: config.runwareApiKey })
const app = await buildApp({ config, db, storage, runware })
await app.listen({ port: config.port, host: '0.0.0.0' })
console.log(`api on :${config.port}`)
