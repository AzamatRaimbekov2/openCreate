// Service-level suite for Modular 3D Assets analyze (ADR modular-3d-assets D2).
// The HTTP E2E suite (assets3d.test.ts) only pins the 502-without-key path
// because there is no Anthropic HTTP fake; the SUCCESS path — parse Claude JSON →
// replaceDraftParts — is proven here by injecting `complete`, mirroring how
// storyboard.test.ts drives the CinemaStudio storyboard. Nothing is charged: the
// analyze path never touches the money path (generations.create), so a spent
// credit here would be a design regression, asserted by `create` never being
// called. Disproving mutation: dropping the isNull citation guards in
// replaceDraftParts (service.ts) so re-analyze deletes the paid/extracted parts
// makes the "extracted parts survive" case go red — which it must, per ADR D2
// "re-running analyze never destroys paid work".
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { MAX_PARTS } from '@opencreate/contracts'
import type { Generation } from '@opencreate/contracts'
import { createDb } from '../src/db/client'
import { createLocalStorage } from '../src/storage/local'
import { createAsset3dService } from '../src/modules/assets3d/service'
import type { GenerationService } from '../src/modules/generations/service'
import {
  Asset3dAnalyzeUnavailableError,
  createAnalyzeService,
  parseAnalyze,
} from '../src/modules/assets3d/analyze'
import { asset3dPart, user } from '../src/db/schema'

const USER = 'user-1'
const CONCEPT = 'data:image/png;base64,iVBORw0KGgo='

// A succeeded image generation is all derivePartStatus reads to call a cited part
// 'extracted'. Cast through unknown so the fixture stays a one-liner rather than a
// full wire Generation.
const succeededImageGen = (id: string) =>
  ({ id, type: 'image', status: 'succeeded', mediaUrls: ['/media/x.webp'] }) as unknown as Generation

function setup() {
  const db = createDb(':memory:').db
  const now = new Date()
  db.insert(user).values({ id: USER, email: 'u@t.co', emailVerified: false, createdAt: now, updatedAt: now }).run()
  const storage = createLocalStorage(mkdtempSync(join(tmpdir(), 'oc-a3d-')))
  // The money path, faked: `create` must NEVER be called by analyze (free step),
  // and `get` reports a cited extraction as succeeded so preserved parts derive
  // to 'extracted'.
  const create = vi.fn()
  const get = vi.fn(async (_userId: string, id: string) => succeededImageGen(id))
  const generations = { create, get } as unknown as Pick<GenerationService, 'create' | 'get'>
  const assets = createAsset3dService({ db, storage, generations })
  return { db, assets, create }
}

// Mark a draft part as PAID by citing an extraction generation, exactly as
// service.extract would (the row's imageGenerationId FK). derivePartStatus then
// reads it as 'extracted' via the faked generations.get.
function markExtracted(db: ReturnType<typeof setup>['db'], partId: string, genId: string) {
  db.update(asset3dPart).set({ imageGenerationId: genId }).where(eq(asset3dPart.id, partId)).run()
}

describe('analyze success (service-level, injected complete)', () => {
  it('replaces draft parts, preserves extracted parts, caps at MAX_PARTS, charges nothing', async () => {
    const { db, assets, create } = setup()
    const asset = await assets.createAsset(USER, { title: 'Knight', conceptImage: CONCEPT })
    // Two already-extracted (paid) parts — must survive a re-analyze.
    const paidA = await assets.addPart(USER, asset.id, { name: 'Helmet', description: 'steel' })
    const paidB = await assets.addPart(USER, asset.id, { name: 'Boots', description: 'leather' })
    markExtracted(db, paidA.id, 'gen-helmet')
    markExtracted(db, paidB.id, 'gen-boots')
    // Three stale DRAFT parts — must be swapped out by analyze.
    const draftIds: string[] = []
    for (const name of ['Old1', 'Old2', 'Old3'])
      draftIds.push((await assets.addPart(USER, asset.id, { name })).id)

    // The model returns MAX_PARTS fresh parts (the cap boundary — all accepted).
    const analyzed = Array.from({ length: MAX_PARTS }, (_, i) => ({ name: `New${i}`, description: `d${i}` }))
    const svc = createAnalyzeService({
      anthropicApiKey: 'test',
      assets,
      complete: async () => JSON.stringify({ parts: analyzed }),
    })

    const parts = await svc.analyze(USER, asset.id)

    // Free step: the money path was never entered.
    expect(create).not.toHaveBeenCalled()

    // Paid parts survive by id, still cite their extraction, still derive 'extracted'.
    const survivorA = parts.find((p) => p.id === paidA.id)
    const survivorB = parts.find((p) => p.id === paidB.id)
    expect(survivorA?.imageGenerationId).toBe('gen-helmet')
    expect(survivorA?.status).toBe('extracted')
    expect(survivorB?.imageGenerationId).toBe('gen-boots')
    expect(survivorB?.status).toBe('extracted')

    // Every stale draft is gone.
    for (const id of draftIds) expect(parts.some((p) => p.id === id)).toBe(false)

    // The analyzed set landed as fresh drafts (no citation). The MAX_PARTS cap is
    // enforced across the WHOLE asset, so with 2 paid survivors only
    // (MAX_PARTS - 2) analyzed drafts are inserted — re-analyze can never push the
    // asset past MAX_PARTS by piling drafts on top of paid work (Bug 2).
    const drafts = parts.filter((p) => p.status === 'draft')
    expect(drafts).toHaveLength(MAX_PARTS - 2)
    expect(drafts.every((p) => p.imageGenerationId === null)).toBe(true)
    // Inserted drafts are a bounded prefix of the analyzed set.
    const analyzedNames = new Set(analyzed.map((p) => p.name))
    expect(drafts.every((p) => analyzedNames.has(p.name))).toBe(true)

    // Total is capped at MAX_PARTS — 2 preserved + (MAX_PARTS - 2) analyzed.
    expect(parts).toHaveLength(MAX_PARTS)
  })
})

describe('parseAnalyze', () => {
  const good = JSON.stringify({ parts: [{ name: 'Body', description: 'torso' }] })

  it('strips an accidental ```json fence', () => {
    expect(parseAnalyze('```json\n' + good + '\n```').parts).toHaveLength(1)
  })
  it('rejects non-JSON as a clean 502 provider error', () => {
    expect(() => parseAnalyze('not json at all')).toThrow(Asset3dAnalyzeUnavailableError)
  })
  it('rejects valid-JSON-but-wrong-shape as a clean 502 provider error', () => {
    expect(() => parseAnalyze(JSON.stringify({ parts: [{ description: 'no name' }] }))).toThrow(
      Asset3dAnalyzeUnavailableError,
    )
  })
  it(`rejects more than MAX_PARTS (${MAX_PARTS}) parts (the cap)`, () => {
    const parts = Array.from({ length: MAX_PARTS + 1 }, (_, i) => ({ name: `p${i}`, description: 'd' }))
    expect(() => parseAnalyze(JSON.stringify({ parts }))).toThrow(Asset3dAnalyzeUnavailableError)
  })
})
