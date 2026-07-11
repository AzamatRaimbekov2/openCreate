// apps/api/test/templates.test.ts
// The template catalog end-to-end: what /api/templates promises, and what
// /api/films/from-template actually builds.
//
// modules/templates/templates.test.ts checks that the DATA is well-formed. This
// file checks the BEHAVIOUR — and specifically the three ways instantiation could
// betray a user:
//
//   1. IT COULD CHARGE THEM. Applying a template must cost zero credits and
//      generate nothing. The shots are drafts; the user spends later, per shot,
//      having seen the prompt. If this ever regresses, someone loses 1120 credits
//      to a mis-click.
//   2. IT COULD LIE ABOUT THE PRICE. The number on the card must be the number the
//      generation endpoint will actually charge for those shots at that tier.
//   3. IT COULD SUBSTITUTE THE WRONG LANGUAGE. The English fragment belongs in the
//      visual prompt; the Russian noun belongs in the spoken line. Swapping them
//      does not throw — it just quietly produces worse footage and a subtitle in
//      the wrong language.
import { describe, expect, it } from 'vitest'
import { buildTestApp, registerAndGetCookie } from './helpers/build-test-app'

type App = Awaited<ReturnType<typeof buildTestApp>>

// Awaited inside: fastify's inject() is only a plain Response once the promise is
// resolved — returning the un-awaited chain gives callers a union with no
// .statusCode on it.
async function fromTemplate(app: App, cookie: string, payload: Record<string, unknown>) {
  return await app.inject({
    method: 'POST',
    url: '/api/films/from-template',
    headers: { cookie },
    payload,
  })
}

const balanceOf = async (app: App, cookie: string) => {
  const res = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })
  return res.json().creditsBalance as number
}

describe('GET /api/templates', () => {
  it('requires auth', async () => {
    const app = await buildTestApp()
    expect((await app.inject({ method: 'GET', url: '/api/templates' })).statusCode).toBe(401)
  })

  it('lists templates with priced tiers and no prompt text', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const res = await app.inject({ method: 'GET', url: '/api/templates', headers: { cookie } })
    expect(res.statusCode).toBe(200)

    const items = res.json().items as Array<Record<string, unknown>>
    expect(items.length).toBeGreaterThan(0)

    const fruit = items.find((t) => t.id === 'fruit-drama')
    expect(fruit).toBeDefined()
    expect(fruit?.aspectRatio).toBe('9:16')
    expect(fruit?.hasVoiceover).toBe(true)

    // The tiers are priced, ascending, and name a model.
    const tiers = fruit?.tiers as Array<{ tier: string; credits: number; modelName: string }>
    expect(tiers.map((x) => x.tier)).toEqual(['draft', 'standard', 'premium'])
    expect(tiers[0]!.credits).toBeLessThan(tiers[2]!.credits)
    expect(tiers[0]!.modelName.length).toBeGreaterThan(0)

    // THE PROMPTS MUST NOT BE ON THE WIRE. The whole point of the summary DTO is
    // that a growing catalog does not ship its prose to every client — and the
    // prompts are the product. A stray `prompt`/`shots` key here means someone
    // serialized the Template instead of the TemplateSummary.
    const serialized = JSON.stringify(fruit)
    expect(serialized).not.toContain('hyper-realistic macro')
    expect(fruit).not.toHaveProperty('shots')
    expect(fruit).not.toHaveProperty('models')

    // The knobs travel WITHOUT their English fragments — a select option is
    // { value, label } only.
    const variables = fruit?.variables as Array<{ key: string; options?: unknown[] }>
    const couple = variables.find((v) => v.key === 'couple')
    expect(couple?.options?.[0]).toEqual({ value: 'strawberry', label: 'Клубника' })
  })
})

describe('POST /api/films/from-template', () => {
  it('requires auth', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/films/from-template',
      payload: { templateId: 'fruit-drama', tier: 'draft', variables: {} },
    })
    expect(res.statusCode).toBe(401)
  })

  it('builds the whole film — every beat, in order, as an UNGENERATED draft', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)

    const res = await fromTemplate(app, cookie, {
      templateId: 'fruit-drama',
      tier: 'standard',
      variables: { couple: 'strawberry', lover: 'eggplant' },
    })
    expect(res.statusCode).toBe(201)

    const { film, shots, audio } = res.json()
    expect(film.templateId).toBe('fruit-drama')
    expect(film.aspectRatio).toBe('9:16')
    // Composed from the variables, not a placeholder.
    expect(film.title).toBe('клубника и баклажан')

    // Nine beats: eight clips and one free title card.
    expect(shots).toHaveLength(9)
    const clips = shots.filter((s: { prompt: string }) => s.prompt.length > 0)
    expect(clips).toHaveLength(8)

    // NOTHING WAS GENERATED. This is the load-bearing assertion of the whole
    // feature: applying a template hands you a draft, not an invoice.
    for (const shot of shots) expect(shot.generationId).toBeNull()
    expect(audio).toEqual([])

    // The tier is PINNED onto every generated shot — that is what shot.modelId is
    // for, and it is how the price the user was quoted becomes the price they pay.
    for (const clip of clips) expect(clip.modelId).toBe('wan-2-7')
    // A title card carries no model and costs nothing.
    const titleCard = shots.find((s: { prompt: string }) => s.prompt.length === 0)
    expect(titleCard.modelId).toBeNull()
    expect(titleCard.title.text).toBe('ЧАСТЬ 2 →')

    // Order is the beat order, not insertion luck.
    const indices = shots.map((s: { orderIndex: number }) => s.orderIndex)
    expect([...indices].sort((a: number, b: number) => a - b)).toEqual(indices)
  })

  it('substitutes English into the prompt and Russian into the spoken line', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)

    const res = await fromTemplate(app, cookie, {
      templateId: 'fruit-drama',
      tier: 'draft',
      variables: { couple: 'cherry', lover: 'banana' },
    })
    const { shots } = res.json()

    // The model-facing prompt gets the English staging fragment...
    const reveal = shots.find((s: { prompt: string }) => s.prompt.includes('newborn baby'))
    expect(reveal.prompt).toContain('banana')
    expect(reveal.prompt).toContain('cherry')
    expect(reveal.prompt).not.toContain('банан')
    expect(reveal.prompt).not.toContain('{{')

    // ...and the spoken line gets the Russian noun, declined correctly. This is
    // the verbatim catchphrase the trend is known by, which only works because the
    // `couple` options are feminine nominative and the `lover` options masculine.
    expect(reveal.voiceover.text).toBe('Я вишня... ты вишня... почему у нас родился банан?!')
    expect(reveal.voiceover.voice).toBe('Dmitry')
  })

  it('resolves a templated voice id and a free-text script (talking-food)', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)

    const res = await fromTemplate(app, cookie, {
      templateId: 'talking-food',
      tier: 'draft',
      variables: {
        food: 'avocado',
        mood: 'sassy',
        voice: 'Nikolai',
        script: 'Во мне больше калия, чем в банане.',
      },
    })
    expect(res.statusCode).toBe(201)
    const { shots } = res.json()

    // The user's own words land in the spoken line of the middle beat...
    expect(shots[1].voiceover.text).toBe('Во мне больше калия, чем в банане.')
    // ...the voice knob resolves to the catalog id (not its Russian label)...
    for (const shot of shots) expect(shot.voiceover.voice).toBe('Nikolai')
    // ...and the free text NEVER reaches a visual prompt. A Russian sentence in a
    // video prompt does not error — it just quietly makes worse footage.
    for (const shot of shots) {
      expect(shot.prompt).not.toContain('калия')
      expect(shot.prompt).toContain('avocado')
      expect(shot.prompt).toContain('sarcastic')
    }
  })

  it('charges nothing', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const before = await balanceOf(app, cookie)

    // The most expensive template at the most expensive tier.
    const res = await fromTemplate(app, cookie, {
      templateId: 'cat-drama',
      tier: 'premium',
      variables: {},
    })
    expect(res.statusCode).toBe(201)

    expect(await balanceOf(app, cookie)).toBe(before)
  })

  it('falls back to every declared default when variables are omitted', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)
    const res = await fromTemplate(app, cookie, {
      templateId: 'cat-drama',
      tier: 'draft',
      variables: {},
    })
    expect(res.statusCode).toBe(201)
    const { film, shots } = res.json()
    // The ginger cat and the black cat — cat-drama's declared defaults.
    expect(film.title).toBe('рыжий кот и предательство')
    expect(shots[0].prompt).toContain('orange tabby')
    expect(shots[1].prompt).toContain('black cat')
    for (const shot of shots) expect(shot.prompt).not.toContain('{{')
  })

  it('rejects an unknown template, an unknown knob, and an illegal option', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)

    expect(
      (await fromTemplate(app, cookie, { templateId: 'nope', tier: 'draft', variables: {} }))
        .statusCode,
    ).toBe(404)

    // An unknown key is a 400, not a silent ignore: quietly dropping a knob the
    // client thought mattered gives the user a film that does not match what they
    // picked, with no way to tell why.
    expect(
      (
        await fromTemplate(app, cookie, {
          templateId: 'fruit-drama',
          tier: 'draft',
          variables: { villain: 'eggplant' },
        })
      ).statusCode,
    ).toBe(400)

    // A select value outside the declared option set would otherwise walk straight
    // into a prompt we pay a provider to render.
    expect(
      (
        await fromTemplate(app, cookie, {
          templateId: 'fruit-drama',
          tier: 'draft',
          variables: { lover: 'pineapple' },
        })
      ).statusCode,
    ).toBe(400)

    expect(
      (
        await fromTemplate(app, cookie, {
          templateId: 'fruit-drama',
          tier: 'luxury',
          variables: {},
        })
      ).statusCode,
    ).toBe(400)
  })

  it('the quoted price is what the pinned model actually charges for those clips', async () => {
    const app = await buildTestApp()
    const cookie = await registerAndGetCookie(app)

    const list = await app.inject({ method: 'GET', url: '/api/templates', headers: { cookie } })
    const items = list.json().items as Array<{
      id: string
      tiers: Array<{ tier: string; credits: number }>
    }>
    const fruit = items.find((t) => t.id === 'fruit-drama')!
    const quoted = fruit.tiers.find((x) => x.tier === 'premium')!.credits

    const res = await fromTemplate(app, cookie, {
      templateId: 'fruit-drama',
      tier: 'premium',
      variables: {},
    })
    const { shots } = res.json()

    // veo-3-1-fast is 140 credits for its only duration (8s) — the catalog's number,
    // not one this test made up. Eight clips at that rate is what the card promised.
    const clips = shots.filter((s: { modelId: string | null }) => s.modelId !== null)
    expect(clips).toHaveLength(8)
    for (const clip of clips) {
      expect(clip.modelId).toBe('veo-3-1-fast')
      expect(clip.durationMs).toBe(8000)
    }
    expect(quoted).toBe(8 * 140)
  })

  it("does not let one user's template film leak to another", async () => {
    const app = await buildTestApp()
    const cookieA = await registerAndGetCookie(app, 'a@b.co')
    const filmId = (
      await fromTemplate(app, cookieA, {
        templateId: 'talking-food',
        tier: 'draft',
        variables: {},
      })
    ).json().film.id

    const cookieB = await registerAndGetCookie(app, 'b@b.co')
    const res = await app.inject({
      method: 'GET',
      url: `/api/films/${filmId}`,
      headers: { cookie: cookieB },
    })
    expect(res.statusCode).toBe(404)
  })
})
