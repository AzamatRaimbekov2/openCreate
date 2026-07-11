// Tagging an entity in a generation. These tests exist because every failure
// mode here is SILENT and PAID: a dropped reference, a raw `[[e1]]` reaching the
// text encoder, or a tag honoured on a model that ignores it all produce a
// plausible image that is not the one the user paid for.
import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { createDb } from '../src/db/client'
import { generationEntity, user } from '../src/db/schema'
import { grantSignupBonus } from '../src/modules/credits/ledger'
import { createEntityService } from '../src/modules/entities/service'
import { createGenerationService } from '../src/modules/generations/service'
import type { RunwareClient } from '../src/integrations/runware/client'
import type { StorageProvider } from '../src/storage/local'
import { fakeRunware } from './helpers/build-test-app'

const GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
const REFERENCE_DATA_URI = 'data:image/gif;base64,REFERENCEBYTES'

const stubStorage = (): StorageProvider => ({
  dir: '/tmp/unused',
  saveFromUrl: async () => '/media/out.webp',
  saveDataUri: async (_d, key) => `/media/${key}.gif`,
  // Runware conditions on data URIs; our /media paths are not publicly reachable
  readAsDataUri: async () => REFERENCE_DATA_URI,
  localPath: (key, ext) => `/media/${key}.${ext}`,
  remove: async () => undefined,
})

async function setup() {
  const { db } = createDb(':memory:')
  db.insert(user)
    .values({ id: 'u1', email: 'u1@x.co', createdAt: new Date(), updatedAt: new Date() })
    .run()
  db.insert(user)
    .values({ id: 'u2', email: 'u2@x.co', createdAt: new Date(), updatedAt: new Date() })
    .run()
  grantSignupBonus(db, 'u1', 500)
  const storage = stubStorage()
  const entities = createEntityService({ db, storage })
  const runware = fakeRunware()
  // Images are synchronous: the service reads the result immediately
  runware.imageInference.mockResolvedValue({ imageURL: 'https://runware.ai/x.webp', cost: 0.04 })
  const generations = createGenerationService({
    db,
    runware: runware as unknown as RunwareClient,
    storage,
    entities,
  })
  return { db, entities, generations, runware }
}

// A character with a photo — the only thing that can actually be rendered
async function seedCharacter(entities: ReturnType<typeof createEntityService>, userId = 'u1') {
  const entity = await entities.create(userId, {
    kind: 'character',
    name: 'Аня',
    description: 'тёмные волосы',
  })
  return entities.addImage(userId, entity.id, { dataUri: GIF, source: 'upload' })
}

const taggedInput = (entityId: string) => ({
  // 'flux-kontext-pro' is the only catalog model that accepts referenceImages
  modelId: 'flux-kontext-pro',
  prompt: '[[e1]] стоит у окна',
  aspectRatio: '1:1' as const,
  entityRefs: [{ placeholder: 'e1', entityId }],
})

describe('generation with entity refs', () => {
  it('composes the prompt and sends the reference image to the provider', async () => {
    const { generations, entities, runware } = await setup()
    const character = await seedCharacter(entities)

    await generations.create('u1', taggedInput(character.id))

    const task = runware.imageInference.mock.calls[0]?.[0]
    // The MODEL never sees the placeholder — it sees the character
    expect(task.positivePrompt).toBe('Аня (тёмные волосы) стоит у окна')
    expect(task.positivePrompt).not.toContain('[[e1]]')
    // ...and it is conditioned on the photo, as a data URI
    expect(task.referenceImages).toEqual([REFERENCE_DATA_URI])
    // Kontext's own dimension list, not our square1024 table
    expect(task.width).toBe(1024)
  })

  it('uses the kontext resolution profile for 16:9 (1392x752, not 1344x768)', async () => {
    const { generations, entities, runware } = await setup()
    const character = await seedCharacter(entities)
    await generations.create('u1', { ...taggedInput(character.id), aspectRatio: '16:9' })
    const task = runware.imageInference.mock.calls[0]?.[0]
    expect(task.width).toBe(1392)
    expect(task.height).toBe(752)
  })

  it('stores the COMPOSED prompt, so the gallery never shows a raw placeholder', async () => {
    const { generations, entities } = await setup()
    const character = await seedCharacter(entities)
    const { dto } = await generations.create('u1', taggedInput(character.id))
    expect(dto.prompt).toBe('Аня (тёмные волосы) стоит у окна')
  })

  it('records provenance: which entity was cited, under which placeholder', async () => {
    const { db, generations, entities } = await setup()
    const character = await seedCharacter(entities)
    const { dto } = await generations.create('u1', taggedInput(character.id))
    const rows = db
      .select()
      .from(generationEntity)
      .where(eq(generationEntity.generationId, dto.id))
      .all()
    expect(rows).toEqual([
      { generationId: dto.id, entityId: character.id, placeholder: 'e1' },
    ])
  })

  it('rejects a tag on a model that cannot condition on references — BEFORE charging', async () => {
    const { db, generations, entities, runware } = await setup()
    const character = await seedCharacter(entities)

    await expect(
      generations.create('u1', { ...taggedInput(character.id), modelId: 'flux-schnell' }),
    ).rejects.toThrow(/reference/i)

    // The user paid nothing and the provider was never called: a tag the model
    // ignores would silently return a stranger for full price
    expect(runware.imageInference).not.toHaveBeenCalled()
    expect(db.select({ b: user.creditsBalance }).from(user).where(eq(user.id, 'u1')).get()?.b).toBe(500)
  })

  it('rejects a tagged entity that has no photo — nothing to condition on', async () => {
    const { generations, entities, runware } = await setup()
    const naked = await entities.create('u1', { kind: 'character', name: 'Без фото', description: '' })
    await expect(generations.create('u1', taggedInput(naked.id))).rejects.toThrow(/photo|image/i)
    expect(runware.imageInference).not.toHaveBeenCalled()
  })

  it('rejects a tag pointing at ANOTHER user entity', async () => {
    const { generations, entities, runware } = await setup()
    const foreign = await seedCharacter(entities, 'u2')
    await expect(generations.create('u1', taggedInput(foreign.id))).rejects.toThrow(/unknown entity/i)
    expect(runware.imageInference).not.toHaveBeenCalled()
  })

  it('rejects a prompt whose placeholder was never declared', async () => {
    const { generations, entities } = await setup()
    const character = await seedCharacter(entities)
    await expect(
      generations.create('u1', { ...taggedInput(character.id), prompt: '[[e1]] и [[e2]]' }),
    ).rejects.toThrow(/unresolved placeholder/i)
  })

  // The hole this closes: with zero refs the substitution pass used to be skipped
  // entirely, so a prompt carrying a stray token sailed through to the encoder,
  // which reads "[[e1]]" as words. Validation must not depend on refs being present.
  it('rejects a stray placeholder even when NO entityRefs are sent', async () => {
    const { generations, runware } = await setup()
    await expect(
      generations.create('u1', { modelId: 'flux-schnell', prompt: '[[e1]] у окна', aspectRatio: '1:1' }),
    ).rejects.toThrow(/unresolved placeholder/i)
    expect(runware.imageInference).not.toHaveBeenCalled()
  })

  it('leaves an untagged generation completely unchanged (no referenceImages key)', async () => {
    const { generations, runware } = await setup()
    await generations.create('u1', { modelId: 'flux-schnell', prompt: 'закат', aspectRatio: '1:1' })
    const task = runware.imageInference.mock.calls[0]?.[0]
    expect(task.positivePrompt).toBe('закат')
    expect(task.referenceImages).toBeUndefined()
  })

  // The face policy, enforced at the boundary. Seedance 2.0 refuses real human
  // faces on input, and it is NOT reference-capable — so a tagged character must
  // be rejected by US, cheaply and before any money moves, rather than shipped to
  // ByteDance to be refused by their moderation. (The client already filters the
  // picker; this is the API keeping its own counsel, per the entity-library ADR:
  // "a capability the client can lie about is not a capability".)
  it('refuses to route a tagged character to seedance-2-0 (never reaches ByteDance)', async () => {
    const { generations, entities } = await setup()
    const character = await seedCharacter(entities)
    await expect(
      generations.create('u1', {
        modelId: 'seedance-2-0',
        prompt: '[[e1]] идёт по улице',
        aspectRatio: '16:9',
        duration: 5,
        entityRefs: [{ placeholder: 'e1', entityId: character.id }],
      }),
    ).rejects.toThrow(/reference/i)
  })

  it('routes a tagged character to nano-banana-pro, the reference model', async () => {
    const { generations, entities, runware } = await setup()
    const character = await seedCharacter(entities)
    await generations.create('u1', {
      modelId: 'nano-banana-pro',
      prompt: '[[e1]] стоит у окна',
      aspectRatio: '16:9',
      entityRefs: [{ placeholder: 'e1', entityId: character.id }],
    })
    const task = runware.imageInference.mock.calls[0]?.[0]
    expect(task.positivePrompt).toBe('Аня (тёмные волосы) стоит у окна')
    expect(task.referenceImages).toHaveLength(1)
    // Its own dimension table, not the default square1024 one.
    expect(task.width).toBe(1376)
    expect(task.height).toBe(768)
  })
})
