// Boot entry (plan Task 3): load validated env config, build the app via the DI
// composition root, and listen. Kept minimal on purpose — all wiring lives in
// app.ts so tests never import this file (it has listen() side effects).
import { buildApp } from './app'
import { loadConfig } from './config'
import { createDb } from './db/client'
import { createLocalStorage } from './storage/local'

const config = loadConfig()
// createDb also runs the idempotent DDL bootstrap, so a fresh checkout can boot
// even before `pnpm db:migrate` was ever run.
const { db } = createDb(config.databasePath)
// Local disk storage (mkdir -p'd on boot); assets are served back at /media/*.
const storage = createLocalStorage(config.storageDir)
const app = await buildApp({ config, db, storage })
await app.listen({ port: config.port, host: '0.0.0.0' })
console.log(`api on :${config.port}`)
