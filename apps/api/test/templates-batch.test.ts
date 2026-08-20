// apps/api/test/templates-batch.test.ts
// The batch instantiation endpoint — Shorts Studio phase 1 (ADR: shorts-studio §2).
//
// templates.test.ts already guards the SINGLE film path. This file guards the
// four ways a BATCH could betray a user, all of which are new because N films
// are now written by one request:
//
//   1. IT COULD CHARGE THEM. A batch is the largest spend the product offers, so
//      the temptation to "just generate them" is real. Creating a batch must cost
//      exactly what creating one film costs: nothing. The runner spends later,
//      per beat, behind an itemised confirm the user has read.
//   2. IT COULD LEAVE A HALF-BATCH BEHIND. One bad row must reject the whole
//      request BEFORE anything is written. Four films of an intended five is a
//      state the user cannot see, cannot name, and would have to clean up by hand.
//   3. IT COULD LOSE THE BATCH ON RELOAD. The batch is a LABEL on films, not a
//      queue — so the only thing that reconstructs the board is
//      GET /api/films?batchId=…. If that filter is wrong the feature has no memory.
//   4. IT COULD LET A CLIENT CLAIM A batchId. Like templateId, batch provenance is
//      a fact the SERVER establishes. A client that can stamp a batch id can merge
//      itself into someone else's board, or forge one that never ran.
import { describe, expect, it } from 'vitest'
import { buildTestApp, registerAndGetCookie } from './helpers/build-test-app'

type App = Awaited<ReturnType<typeof buildTestApp>>

// Awaited inside for the same reason templates.test.ts does it: inject() is only
// a plain Response once the promise resolves.
async function batch(app: App, cookie: string, payload: Record<string, unknown>) {
  return await app.inject({
    method: 'POST',
    url: '/api/films/from-template/batch',
    headers: { cookie },
    payload,
  })
}

const balanceOf = async (app: App, cookie: string) => {
  const res = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
  return res.json().creditsBalance as number
}

const listFilms = async (app: App, cookie: string, query = '') => {
  const res = await app.inject({ method: 'GET', url: `/api/films${query}`, headers: { cookie } })
  return res
}

// fruit-drama: 9 beats, 8 of them clips, two select knobs whose options are a
// closed set. The most-tested template in the catalog, so a failure here is a
// failure of the BATCH, not of the template.
const ROWS_OF_THREE = [
  { variables: { couple: 'strawberry', lover: 'eggplant' }, title: 'Первый' },
  { variables: { couple: 'cherry', lover: 'banana' }, title: 'Второй' },
  { variables: { couple: 'raspberry', lover: 'cucumber' }, title: 'Третий' },
]

describe('POST /api/films/from-template/batch', () => {
  it('requires auth', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/films/from-template/batch',
      payload: { templateId: 'fruit-drama', tier: 'draft', rows: [{ variables: {} }] },
    })
    expect(res.statusCode).toBe(401)
  })

  it('creates one film per row under a single batchId and charges NOTHING', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const before = await balanceOf(app, cookie)

    const res = await batch(app, cookie, {
      templateId: 'fruit-drama',
      // The most expensive tier on purpose: if a batch ever charges, it charges
      // most here, and this assertion is the one that catches it.
      tier: 'premium',
      rows: ROWS_OF_THREE,
    })
    expect(res.statusCode).toBe(201)

    const { batchId, films } = res.json()
    expect(typeof batchId).toBe('string')
    expect(batchId.length).toBeGreaterThan(0)
    expect(films).toHaveLength(3)

    // Every film carries THE SAME batch id, and it is the one the response names.
    // That single value is the whole data model of a batch — get it wrong and the
    // board is three unrelated films.
    for (const detail of films) expect(detail.film.batchId).toBe(batchId)
    // …and each row keeps its own title and its own knob values.
    expect(films.map((d: { film: { title: string } }) => d.film.title)).toEqual([
      'Первый',
      'Второй',
      'Третий',
    ])
    expect(films[1].shots.some((s: { prompt: string }) => s.prompt.includes('cherry'))).toBe(true)

    // Three films × nine beats. The batch instantiates the template per row — it
    // does not thin it out.
    for (const detail of films) expect(detail.shots).toHaveLength(9)

    // THE PRODUCT LAW: applying a template is free, and a batch is N applications.
    // The credits go later, per beat, through generations.create.
    expect(await balanceOf(app, cookie)).toBe(before)
  })

  it('lands every shot as a draft — nothing is generated', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)

    const res = await batch(app, cookie, {
      templateId: 'fruit-drama',
      tier: 'standard',
      rows: ROWS_OF_THREE,
    })
    expect(res.statusCode).toBe(201)

    for (const detail of res.json().films) {
      for (const shot of detail.shots) expect(shot.generationId).toBeNull()
      expect(detail.audio).toEqual([])
    }
  })

  it('rejects the WHOLE request when one row is invalid, and writes nothing', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)

    // Row 2 names a value outside the declared option set; row 3 names a knob the
    // template does not declare. Either alone must sink all three.
    for (const badRows of [
      [
        { variables: { couple: 'strawberry' } },
        { variables: { lover: 'pineapple' } },
        { variables: { couple: 'cherry' } },
      ],
      [
        { variables: { couple: 'strawberry' } },
        { variables: { couple: 'cherry' } },
        { variables: { villain: 'eggplant' } },
      ],
    ]) {
      const res = await batch(app, cookie, {
        templateId: 'fruit-drama',
        tier: 'draft',
        rows: badRows,
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().error.code).toBe('validation_failed')

      // A half-batch is worse than none: the two GOOD rows must not have landed.
      const films = (await listFilms(app, cookie)).json().items
      expect(films).toEqual([])
    }
  })

  it('rejects an unknown template before writing anything', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const res = await batch(app, cookie, {
      templateId: 'nope',
      tier: 'draft',
      rows: [{ variables: {} }],
    })
    expect(res.statusCode).toBe(404)
    expect((await listFilms(app, cookie)).json().items).toEqual([])
  })

  it('rejects more than 20 rows', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)

    const rows = Array.from({ length: 21 }, () => ({ variables: {} }))
    const res = await batch(app, cookie, { templateId: 'fruit-drama', tier: 'draft', rows })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('validation_failed')
    expect((await listFilms(app, cookie)).json().items).toEqual([])
  })

  it('rejects an empty rows array', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const res = await batch(app, cookie, { templateId: 'fruit-drama', tier: 'draft', rows: [] })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('validation_failed')
  })
})

describe('GET /api/films?batchId=', () => {
  it('returns exactly the films of that batch', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)

    const first = await batch(app, cookie, {
      templateId: 'fruit-drama',
      tier: 'draft',
      rows: ROWS_OF_THREE,
    })
    const second = await batch(app, cookie, {
      templateId: 'fruit-drama',
      tier: 'draft',
      rows: [{ variables: {} }, { variables: {} }],
    })
    // A hand-made film, which belongs to no batch and must never show up in one.
    await app.inject({
      method: 'POST',
      url: '/api/films',
      headers: { cookie },
      payload: { title: 'Отдельный фильм' },
    })

    const firstId = first.json().batchId as string
    const secondId = second.json().batchId as string
    expect(firstId).not.toBe(secondId)

    const filtered = await listFilms(app, cookie, `?batchId=${firstId}`)
    expect(filtered.statusCode).toBe(200)
    const items = filtered.json().items as Array<{ id: string; batchId: string | null }>
    expect(items).toHaveLength(3)
    for (const film of items) expect(film.batchId).toBe(firstId)

    // Unfiltered still returns everything: 3 + 2 + the hand-made one.
    expect((await listFilms(app, cookie)).json().items).toHaveLength(6)

    // A batch id that is not ours (well-formed, never minted here) is an empty
    // board, not someone else's.
    const foreign = await listFilms(app, cookie, '?batchId=11111111-1111-4111-8111-111111111111')
    expect(foreign.statusCode).toBe(200)
    expect(foreign.json().items).toEqual([])
  })

  it('does not leak another user’s batch', async () => {
    const app = await buildTestApp()
    const owner = await registerAndGetCookie(app, 'owner@b.co')
    const stranger = await registerAndGetCookie(app, 'stranger@b.co')

    const res = await batch(app, owner, {
      templateId: 'fruit-drama',
      tier: 'draft',
      rows: ROWS_OF_THREE,
    })
    const batchId = res.json().batchId as string

    // The id is guessable to anyone who saw it once — ownership, not obscurity,
    // is what keeps the board private.
    expect((await listFilms(app, stranger, `?batchId=${batchId}`)).json().items).toEqual([])
  })
})

describe('batchId is provenance, not a client claim', () => {
  it('ignores a batchId the client tries to set on either create route', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const forged = '22222222-2222-4222-8222-222222222222'

    const templated = await app.inject({
      method: 'POST',
      url: '/api/films/from-template',
      headers: { cookie },
      payload: { templateId: 'fruit-drama', tier: 'draft', variables: {}, batchId: forged },
    })
    expect(templated.statusCode).toBe(201)
    expect(templated.json().film.batchId).toBeNull()

    const handMade = await app.inject({
      method: 'POST',
      url: '/api/films',
      headers: { cookie },
      payload: { title: 'Подделка', batchId: forged },
    })
    expect(handMade.statusCode).toBe(201)
    expect(handMade.json().batchId).toBeNull()

    // And the forged id addresses nothing.
    expect((await listFilms(app, cookie, `?batchId=${forged}`)).json().items).toEqual([])
  })
})

describe('the batch route is rate limited more strictly than the single one', () => {
  it('the 11th batch in a minute gets 429', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    // One row each: the bucket counts CALLS, not films. Ten is the budget — a
    // number nobody reaches by hand, and half the single route's because one call
    // here is up to twenty times the write.
    const one = () =>
      batch(app, cookie, {
        templateId: 'fruit-drama',
        tier: 'draft',
        rows: [{ variables: {} }],
      })
    for (let i = 0; i < 10; i++) expect((await one()).statusCode).toBe(201)

    const blocked = await one()
    expect(blocked.statusCode).toBe(429)
    expect(blocked.json().error.code).toBe('rate_limited')
  })
})

describe('the response is ordered by ROW', () => {
  // The run board maps variant row i to films[i], and the itemised confirm the
  // user agreed to is per row. So this is not an incidental property of the
  // insert loop — it is a contract, and a later refactor that reads the films
  // back with a query (ordered by updatedAt, which is IDENTICAL across a batch)
  // would scramble it without failing anything else.
  it('films[i] is the film built from rows[i]', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)

    const res = await batch(app, cookie, {
      templateId: 'fruit-drama',
      tier: 'draft',
      rows: ROWS_OF_THREE,
    })
    expect(res.statusCode).toBe(201)
    const films = res.json().films as Array<{
      film: { title: string }
      shots: Array<{ prompt: string }>
    }>

    // Each row's OWN knob values must be in the film at the same index — not
    // merely present somewhere in the batch.
    const expected = [
      { title: 'Первый', couple: 'strawberry', lover: 'eggplant' },
      { title: 'Второй', couple: 'cherry', lover: 'banana' },
      { title: 'Третий', couple: 'raspberry', lover: 'cucumber' },
    ]
    expected.forEach((row, i) => {
      const detail = films[i]!
      expect(detail.film.title).toBe(row.title)
      const prompts = detail.shots.map((s) => s.prompt).join(' ')
      expect(prompts).toContain(row.couple)
      expect(prompts).toContain(row.lover)
      // …and NOT another row's, which is what catches an off-by-one.
      for (const other of expected.filter((r) => r !== row))
        expect(prompts).not.toContain(other.lover)
    })
  })
})
