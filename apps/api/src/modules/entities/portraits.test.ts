// The reference-sheet orchestrator. Two properties are load-bearing and neither
// is visible from a single call:
//
//  · THE MODEL RULE (ADR §3). The first view has nothing to reference, so it
//    renders on the cheap model with no refs; every LATER view references the
//    photo the first one produced, on the only model in the catalogue that can
//    accept a reference. Get this wrong and a four-view sheet is four strangers
//    — for 26 credits, silently, with no error anywhere.
//  · PARTIAL FAILURE. A sheet is N separately-paid jobs. One dead view must not
//    abort (or hide) the ones the user actually received and was charged for.
//
// The generation service is FAKED here — but a faithful fake: it records the
// input it was handed and writes a real succeeded row, so the attach path under
// test is the production one, reading the production table.
import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { SOUL_HERO_MODEL_ID, SOUL_SHEET_MODEL_ID, composeSoul } from '@opencreate/contracts'
import type { CreateGenerationInput, Generation, Soul } from '@opencreate/contracts'
import { createDb } from '../../db/client'
import { generation, user } from '../../db/schema'
import { createEntityService } from './service'
import type { EntityService } from './service'
import { SoulRequiredError, createPortraitService } from './portraits'
import type { StorageProvider } from '../../storage/local'

const GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

const SOUL: Soul = { archetype: 'male', styleId: 'comic', traits: ['iron-arm'], notes: '' }

const storage = {
  dir: '/tmp/unused',
  saveFromUrl: async () => {
    throw new Error('entities never fetch a remote URL')
  },
  saveDataUri: async (_dataUri: string, key: string) => `/media/${key}.gif`,
  readAsDataUri: async () => GIF,
  remove: async () => undefined,
} as unknown as StorageProvider

let db: ReturnType<typeof createDb>['db']
let entities: EntityService
let portraits: ReturnType<typeof createPortraitService>
// What the generation service was ASKED to make, in order. The whole model rule
// is an assertion on this array.
let submitted: CreateGenerationInput[]
// 1-based indexes of calls the fake provider should blow up on. `failAt` throws
// a DOMAIN error (carrying the stable apiCode every error in this codebase has);
// `failRawAt` throws a bare Error with a message full of operator-only detail —
// the case that must never reach the browser.
let failAt: Set<number>
let failRawAt: Set<number>

// What a provider failure actually looks like coming out of the generation
// service: refunded already, and tagged with a code the SPA can localize.
const PROVIDER_ERROR = () =>
  Object.assign(new Error('Blocked by the content safety filter'), {
    statusCode: 422,
    apiCode: 'content_blocked',
  })

beforeEach(() => {
  db = createDb(':memory:').db
  submitted = []
  failAt = new Set()
  failRawAt = new Set()
  const now = new Date()
  db.insert(user)
    .values({ id: 'u1', email: 'a@b.c', emailVerified: true, createdAt: now, updatedAt: now })
    .run()
  entities = createEntityService({ db, storage })

  const generations = {
    create: async (userId: string, input: CreateGenerationInput) => {
      submitted.push(input)
      // The real service refunds before it rethrows; the orchestrator's only job
      // is to record the failure and carry on to the next view.
      if (failAt.has(submitted.length)) throw PROVIDER_ERROR()
      // An UNEXPECTED failure — no apiCode, and a message that names our infra.
      if (failRawAt.has(submitted.length))
        throw new Error('connect ECONNREFUSED 10.0.3.7:5432 (account acct_9f21)')
      const id = randomUUID()
      db.insert(generation)
        .values({
          id,
          userId,
          type: 'image',
          mode: 'text',
          status: 'succeeded',
          prompt: input.prompt,
          modelId: input.modelId,
          paramsJson: '{}',
          costCredits: 2,
          mediaJson: JSON.stringify(['/media/gen-asset.gif']),
          createdAt: new Date(),
        })
        .run()
      return { dto: { id } as unknown as Generation, created: true }
    },
  }

  portraits = createPortraitService({ entities, generations })
})

describe('createPortraitService — the model rule', () => {
  it('renders the HERO shot on the cheap model with no references', async () => {
    const entity = await entities.create('u1', { kind: 'character', name: 'Капитан', description: '', soul: SOUL })

    const result = await portraits.create('u1', entity.id, { views: ['front'] })

    expect(submitted).toHaveLength(1)
    expect(submitted[0]?.modelId).toBe(SOUL_HERO_MODEL_ID)
    // No photo exists yet, so there is nothing to reference — and asking the
    // reference model to condition on nothing would just cost 4x more.
    expect(submitted[0]?.entityRefs).toBeUndefined()
    expect(submitted[0]?.aspectRatio).toBe('1:1')
    expect(submitted[0]?.prompt).toContain(composeSoul(SOUL))
    expect(submitted[0]?.promptPreset).toEqual({ styleId: 'comic', framing: 'reference-sheet' })
    expect(result.portraits).toEqual([{ view: 'front', generationId: expect.any(String), errorCode: null }])
  })

  it('renders a LATER view on the reference model, with the character referencing itself', async () => {
    const entity = await entities.create('u1', { kind: 'character', name: 'Капитан', description: '', soul: SOUL })

    await portraits.create('u1', entity.id, { views: ['front', 'full-body'] })

    expect(submitted).toHaveLength(2)
    expect(submitted[1]?.modelId).toBe(SOUL_SHEET_MODEL_ID)
    // The self-reference IS the feature: it is what keeps the face the same
    // across the sheet. It only exists because the hero shot already landed and
    // became primary — which is why the loop is sequential and reloads.
    expect(submitted[1]?.entityRefs).toEqual([{ placeholder: 'e1', entityId: entity.id }])
    // ...and the prompt must NOT carry the [[e1]] token: the ref is there to
    // deliver the IMAGE, and substituting it would paste the character's own
    // description inside its own description.
    expect(submitted[1]?.prompt).not.toContain('[[e1]]')
    // A full-body shot in a square frame wastes half the pixels on background.
    expect(submitted[1]?.aspectRatio).toBe('9:16')
  })

  it('attaches every portrait to the entity in sheet order', async () => {
    const entity = await entities.create('u1', { kind: 'character', name: 'Капитан', description: '', soul: SOUL })

    const result = await portraits.create('u1', entity.id, {
      views: ['front', 'three-quarter', 'profile', 'full-body'],
    })

    expect(result.portraits.every((portrait) => portrait.errorCode === null)).toBe(true)
    expect(result.entity.images.map((image) => image.view)).toEqual([
      'front',
      'three-quarter',
      'profile',
      'full-body',
    ])
    // Attaching in the same call is deliberate: a client-side attach step would
    // leave a window in which the user is charged for an orphaned portrait.
    expect(result.entity.primaryImageId).not.toBeNull()
  })
})

describe('createPortraitService — failure and validation', () => {
  it('reports a failed view and still renders the remaining ones', async () => {
    const entity = await entities.create('u1', { kind: 'character', name: 'Капитан', description: '', soul: SOUL })
    failAt.add(2) // the three-quarter view

    const result = await portraits.create('u1', entity.id, {
      views: ['front', 'three-quarter', 'profile'],
    })

    expect(result.portraits.map((portrait) => portrait.view)).toEqual([
      'front',
      'three-quarter',
      'profile',
    ])
    expect(result.portraits[1]).toEqual({
      view: 'three-quarter',
      generationId: null,
      errorCode: 'content_blocked',
    })
    // The third view was still attempted and still paid off — collapsing four
    // paid jobs into one error would hide which ones the user actually got.
    expect(result.portraits[2]?.generationId).toEqual(expect.any(String))
    expect(result.entity.images.map((image) => image.view)).toEqual(['front', 'profile'])
  })

  // The whole reason a view reports a CODE and not a message. Everything in this
  // response is serialized to the browser; an unexpected error's message is
  // operator material (hostnames, ports, account ids) and must die at this
  // boundary, exactly as app.ts kills it for ordinary error envelopes.
  it('never leaks an unexpected error message to the client', async () => {
    const entity = await entities.create('u1', {
      kind: 'character',
      name: 'Капитан',
      description: '',
      soul: SOUL,
    })
    failRawAt.add(1)

    const result = await portraits.create('u1', entity.id, { views: ['front'] })

    expect(result.portraits[0]).toEqual({
      view: 'front',
      generationId: null,
      errorCode: 'internal_error',
    })
    expect(JSON.stringify(result)).not.toMatch(/ECONNREFUSED|10\.0\.3\.7|acct_9f21/)
  })

  it('still uses the reference model after a failed view (the hero photo is what matters)', async () => {
    const entity = await entities.create('u1', { kind: 'character', name: 'Капитан', description: '', soul: SOUL })
    failAt.add(2)

    await portraits.create('u1', entity.id, { views: ['front', 'three-quarter', 'profile'] })

    // The failure did not lose the primary photo, so view 3 still references it.
    expect(submitted[2]?.modelId).toBe(SOUL_SHEET_MODEL_ID)
  })

  it('refuses to mint portraits for an entity with no soul', async () => {
    const entity = await entities.create('u1', { kind: 'character', name: 'Аня', description: 'проза' })
    await expect(portraits.create('u1', entity.id, { views: ['front'] })).rejects.toThrow(
      SoulRequiredError,
    )
    // Nothing was submitted, so nothing was charged.
    expect(submitted).toEqual([])
  })

  it('refuses to mint portraits on someone else entity', async () => {
    const entity = await entities.create('u1', { kind: 'character', name: 'Капитан', description: '', soul: SOUL })
    await expect(portraits.create('u2', entity.id, { views: ['front'] })).rejects.toThrow(/not found/i)
    expect(submitted).toEqual([])
  })
})
