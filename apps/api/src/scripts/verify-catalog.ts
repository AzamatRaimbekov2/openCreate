// Manual pre-launch check (plan Task 7): confirm every CATALOG AIR id actually
// exists on Runware via the modelSearch task. Research flagged `minimax:4@1`
// and `google:3@2` as unverified — this script is the launch gate for them.
//
// Run:  RUNWARE_API_KEY=... pnpm --filter @opencreate/api exec tsx src/scripts/verify-catalog.ts
// Exit: 0 when every AIR id is FOUND, 1 when any is NOT-FOUND (or key missing).
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { CATALOG } from '../modules/catalog/catalog'

// Only the Runware key is needed here — deliberately NOT loadConfig(), which
// would demand the full app env (auth secret etc.) for a standalone check.
const env = z.object({ RUNWARE_API_KEY: z.string().min(1) }).safeParse(process.env)
if (!env.success) {
  console.error('RUNWARE_API_KEY is required (real key — modelSearch hits the live API)')
  process.exit(1)
}
const apiKey = env.data.RUNWARE_API_KEY

const ENDPOINT = 'https://api.runware.ai/v1'

type ModelSearchRaw = {
  data?: Array<{ results?: Array<{ air?: string }> }>
  errors?: Array<{ message?: string }>
}

async function airExists(air: string): Promise<boolean> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    // `search` with the AIR id is the narrowest query modelSearch supports; we
    // then require an exact `air` match in results so partial hits don't pass.
    body: JSON.stringify([{ taskType: 'modelSearch', taskUUID: randomUUID(), search: air, limit: 5 }]),
  })
  if (!res.ok) throw new Error(`Runware HTTP ${res.status}`)
  const raw = (await res.json()) as ModelSearchRaw
  const err = raw.errors?.[0]
  if (err) throw new Error(err.message ?? 'modelSearch failed')
  return (raw.data?.[0]?.results ?? []).some((r) => r.air === air)
}

let missing = 0
for (const model of CATALOG) {
  let status: string
  try {
    status = (await airExists(model.air)) ? 'FOUND' : 'NOT-FOUND'
  } catch (e) {
    status = `ERROR (${e instanceof Error ? e.message : 'unknown'})`
  }
  if (status !== 'FOUND') missing += 1
  console.log(`${status.padEnd(24)} ${model.id.padEnd(16)} ${model.air}`)
}

if (missing > 0) {
  console.error(`\n${missing} model(s) not verified — fix AIR ids in catalog.ts before launch`)
  process.exit(1)
}
console.log('\nall catalog AIR ids verified')
