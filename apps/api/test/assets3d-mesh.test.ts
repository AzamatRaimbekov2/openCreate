// Service-level suite for the mesh() precondition guard (ADR modular-3d-assets D3).
// The HTTP E2E suite (assets3d.test.ts) can only reach the "no extraction yet"
// branch, because an image generation settles SYNCHRONOUSLY and is only ever
// cited on success — there is no HTTP path that leaves imageGenerationId pointing
// at a still-processing or failed image. This suite constructs exactly that state
// by citing a scripted generation on the row directly, then proves mesh() rejects
// it BEFORE any charge: the fake `create` (the money path) is asserted un-called
// and the provider is never reached. Disproving mutation: weakening the guard to
// only check `img.type !== 'image'` (dropping the status check) makes a processing
// image sail through to create() and turns both rejects/not-called assertions red.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import type { Generation } from '@opencreate/contracts'
import { createDb } from '../src/db/client'
import { createLocalStorage } from '../src/storage/local'
import { createAsset3dService, Asset3dValidationError } from '../src/modules/assets3d/service'
import type { GenerationService } from '../src/modules/generations/service'
import { asset3dPart, user } from '../src/db/schema'

const USER = 'user-1'
const CONCEPT = 'data:image/png;base64,iVBORw0KGgo='

// Build the service with a fake generation service: `get` returns a scripted
// generation per id, `create` is a spy that MUST NOT be called when a precondition
// rejects (no charge, no provider call). Cast the fixtures through Generation since
// derivePartStatus / mesh only read id/type/status/mediaUrls.
function setup(gens: Record<string, Partial<Generation>>) {
  const db = createDb(':memory:').db
  const now = new Date()
  db.insert(user).values({ id: USER, email: 'u@t.co', emailVerified: false, createdAt: now, updatedAt: now }).run()
  const storage = createLocalStorage(mkdtempSync(join(tmpdir(), 'oc-a3d-mesh-')))
  const create = vi.fn()
  const get = vi.fn(async (_u: string, id: string) => {
    const g = gens[id]
    if (!g) throw new Error(`no scripted generation for ${id}`)
    return g as Generation
  })
  const generations = { create, get } as unknown as Pick<GenerationService, 'create' | 'get'>
  const assets = createAsset3dService({ db, storage, generations })
  return { db, assets, create }
}

// Cite an image generation id on a part row directly, exactly as service.extract
// would write the imageGenerationId FK.
function citeImage(db: ReturnType<typeof setup>['db'], partId: string, genId: string) {
  db.update(asset3dPart).set({ imageGenerationId: genId }).where(eq(asset3dPart.id, partId)).run()
}

describe('mesh precondition guard (service-level)', () => {
  it('rejects meshing when the cited extraction image is still processing — never charges', async () => {
    const { db, assets, create } = setup({
      'img-1': { id: 'img-1', type: 'image', status: 'processing' } as Partial<Generation>,
    })
    const asset = await assets.createAsset(USER, { title: 'Knight', conceptImage: CONCEPT })
    const part = await assets.addPart(USER, asset.id, { name: 'Helmet' })
    citeImage(db, part.id, 'img-1')
    await expect(assets.mesh(USER, asset.id, part.id, { modelId: 'trellis-2' })).rejects.toBeInstanceOf(
      Asset3dValidationError,
    )
    expect(create).not.toHaveBeenCalled() // no charge, provider never reached
  })

  it('rejects meshing when the cited extraction image failed — never charges', async () => {
    const { db, assets, create } = setup({
      'img-1': { id: 'img-1', type: 'image', status: 'failed' } as Partial<Generation>,
    })
    const asset = await assets.createAsset(USER, { title: 'Knight', conceptImage: CONCEPT })
    const part = await assets.addPart(USER, asset.id, { name: 'Helmet' })
    citeImage(db, part.id, 'img-1')
    await expect(assets.mesh(USER, asset.id, part.id, { modelId: 'trellis-2' })).rejects.toBeInstanceOf(
      Asset3dValidationError,
    )
    expect(create).not.toHaveBeenCalled()
  })
})
