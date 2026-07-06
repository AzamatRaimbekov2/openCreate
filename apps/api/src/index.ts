// Boot entry (plan Task 3): load validated env config, build the app via the DI
// composition root, and listen. Kept minimal on purpose — all wiring lives in
// app.ts so tests never import this file (it has listen() side effects).
import { buildApp } from './app'
import { loadConfig } from './config'

const config = loadConfig()
const app = await buildApp({ config })
await app.listen({ port: config.port, host: '0.0.0.0' })
console.log(`api on :${config.port}`)
