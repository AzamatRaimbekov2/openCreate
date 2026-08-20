// apps/api/src/modules/templates/templates.test.ts
// The correctness core of the template catalog.
//
// A template is DATA, so the type system can only check its shape — it cannot see
// the model catalog, and it cannot see that the word "{{lover}}" inside a prompt
// string has to correspond to a declared variable. Every way a template can be
// wrong is therefore invisible at compile time and silent at runtime:
//
//   · A tier model that cannot do an 8s clip → composeShotClipInput snaps the
//     duration to the nearest legal value. The user is quoted 448 credits, gets
//     charged 560, and the cut they were shown is not the cut they get.
//   · A typo'd {{placeholder}} → the literal braces are rendered into the prompt
//     and paid for.
//   · A free-text variable substituted into a visual prompt → a Russian sentence
//     lands in a Veo prompt. It does not error. It just makes worse footage.
//   · A voice id that is not in the catalog → the TTS call 400s eight credits in.
//
// None of these fail loudly on their own. That is what this file is for.
import { describe, expect, it } from 'vitest'
import { DISCLOSURE_TIERS } from '@opencreate/contracts'
import { CATALOG, getModel } from '../catalog/catalog'
import { TEMPLATES } from './catalog'
import { assertTemplatesValid } from './service'
import { isClip, type TemplateShot } from './types'

const PLACEHOLDER = /\{\{(\w+)\}\}/g
const placeholdersIn = (text: string): string[] =>
  [...text.matchAll(PLACEHOLDER)].map((m) => m[1] as string)

// Every string in a shot that a placeholder may legally appear in, tagged by
// whether it is a VISUAL prompt (English, model-facing) or a SPOKEN/overlay
// string (Russian, human-facing). The distinction is the whole point of test 4.
function stringsOf(shot: TemplateShot): Array<{ text: string; visual: boolean }> {
  const out: Array<{ text: string; visual: boolean }> = []
  if (isClip(shot)) {
    out.push({ text: shot.prompt, visual: true })
    if (shot.voiceover) {
      out.push({ text: shot.voiceover.text, visual: false })
      out.push({ text: shot.voiceover.voice, visual: false })
    }
  }
  if (shot.title) out.push({ text: shot.title.text, visual: false })
  return out
}

describe('template catalog', () => {
  it('boots — every tier model can actually render every clip', () => {
    // The same assertion app.ts runs at boot. Duplicated here so a broken template
    // fails in CI rather than on deploy.
    expect(() => assertTemplatesValid()).not.toThrow()
  })

  it('has no duplicate template ids', () => {
    const ids = TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('names no trademark the providers moderate on', () => {
    // Written for the brick shelf, enforced catalog-wide because the failure is
    // expensive in two independent ways and neither is visible in review:
    //   · Veo's moderation rejects prompts naming a toy brand outright, so the
    //     premium tier — the only one that speaks — would 400 on every beat while
    //     draft and standard rendered fine. A tier that silently doesn't work.
    //   · It is someone else's registered mark, and these strings are product
    //     copy on a public endpoint, not internal notes.
    // The aesthetic is reachable without the name ("plastic construction bricks",
    // "stop-motion brickfilm", "visible brick studs"), so there is no cost to the
    // ban — only to forgetting it. Word-boundary matched so "allegory" and friends
    // do not trip it.
    //
    // WIDENED 2026-08-20 for «Фигурка в большом мире» (shorts-figurine-pov). That
    // card is the AI-collectible format, and the collectible lines it evokes are
    // live trademarks under active enforcement. The card is authored to take the
    // USER'S character from the entity library precisely so it never has to name
    // one — this pattern makes that a rule rather than an intention, catalog-wide,
    // for the same two reasons the toy brand is banned: someone else's mark, and
    // a phrase a provider's moderation may reject on the premium tier only.
    const BANNED = /\blegos?\b|\blabubu\b|\bsonny\s*angel\b|\bsmiski\b|\bpop\s*mart\b/i
    for (const t of TEMPLATES) {
      const strings = [
        t.id,
        t.name,
        t.tagline,
        t.description,
        t.titleTemplate,
        t.musicPrompt ?? '',
        ...Object.values(t.tierNotes ?? {}),
        ...t.variables.flatMap((v) => [
          v.label,
          v.hint ?? '',
          v.defaultValue,
          ...(v.kind === 'select'
            ? v.options.flatMap((o) => [o.label, o.prompt, o.spoken ?? ''])
            : []),
        ]),
        ...t.shots.flatMap((s) => [s.beat, ...stringsOf(s).map((f) => f.text)]),
      ]
      for (const text of strings)
        expect(BANNED.test(text), `${t.id}: "${text}" names a trademarked brand`).toBe(false)
    }
  })

  describe.each(TEMPLATES.map((t) => [t.id, t] as const))('%s', (_id, template) => {
    const declared = new Set(template.variables.map((v) => v.key))
    const textKeys = new Set(
      template.variables.filter((v) => v.kind === 'text').map((v) => v.key),
    )

    it('every {{placeholder}} names a declared variable', () => {
      const used = [
        ...placeholdersIn(template.titleTemplate),
        ...template.shots.flatMap((s) => stringsOf(s).flatMap((f) => placeholdersIn(f.text))),
      ]
      for (const key of used) expect(declared, `unknown {{${key}}}`).toContain(key)
    })

    it('every declared variable is actually used somewhere', () => {
      // A knob the user turns that changes nothing is worse than no knob.
      const used = new Set([
        ...placeholdersIn(template.titleTemplate),
        ...template.shots.flatMap((s) => stringsOf(s).flatMap((f) => placeholdersIn(f.text))),
      ])
      for (const key of declared) expect(used, `{{${key}}} is declared but never used`).toContain(key)
    })

    it('no free-text variable is substituted into a visual prompt', () => {
      // The silent one. A Russian sentence in a Veo prompt does not throw — it
      // just quietly produces worse footage, and an unbounded user string reaching
      // a prompt is a hole we would rather not have at all.
      for (const shot of template.shots) {
        for (const field of stringsOf(shot)) {
          if (!field.visual) continue
          for (const key of placeholdersIn(field.text))
            expect(textKeys, `free-text {{${key}}} reached a visual prompt`).not.toContain(key)
        }
      }
    })

    it('every select option has a prompt fragment, and every default is a real option', () => {
      for (const v of template.variables) {
        if (v.kind !== 'select') {
          expect(v.defaultValue.length).toBeGreaterThan(0)
          expect(v.defaultValue.length).toBeLessThanOrEqual(v.maxLength)
          continue
        }
        const values = v.options.map((o) => o.value)
        expect(values, `${v.key}: defaultValue is not an option`).toContain(v.defaultValue)
        expect(new Set(values).size, `${v.key}: duplicate option values`).toBe(values.length)
      }
    })

    it('every voice resolves to one the catalog offers, for every option combination', () => {
      // Voices reach the wire as literal strings (the `voice` variable in
      // talking-food substitutes a catalog id). A voice the provider retired must
      // fail here, in CI, and not eight credits into a user's TTS call.
      const tts = CATALOG.find((m) => m.type === 'audio' && m.audioKind === 'tts')
      const voices: string[] = tts && 'voices' in tts ? (tts.voices ?? []) : []
      expect(voices.length).toBeGreaterThan(0)

      // The candidate values a {{voice}} placeholder can expand to.
      const voiceCandidates = new Map<string, string[]>()
      for (const v of template.variables) {
        if (v.kind !== 'select') continue
        voiceCandidates.set(
          v.key,
          v.options.map((o) => o.spoken ?? o.label.toLowerCase()),
        )
      }

      for (const shot of template.shots) {
        if (!isClip(shot) || !shot.voiceover) continue
        const raw = shot.voiceover.voice
        const keys = placeholdersIn(raw)
        if (keys.length === 0) {
          expect(voices, `voice "${raw}" is not in the catalog`).toContain(raw)
          continue
        }
        // A templated voice: EVERY option the user could pick must resolve to a
        // real catalog voice, not just the default.
        for (const key of keys) {
          for (const candidate of voiceCandidates.get(key) ?? []) {
            const resolved = raw.replace(`{{${key}}}`, candidate)
            expect(voices, `voice "${resolved}" (via {{${key}}}) is not in the catalog`).toContain(
              resolved,
            )
          }
        }
      }
    })

    it('prices honestly: the quoted total is the sum of what each clip will cost', () => {
      // The number on the card is the number the user is deciding against. It must
      // be arithmetic over the live catalog, not an authored constant that can go
      // stale the first time a provider changes its rate.
      const clips = template.shots.filter(isClip)
      expect(clips.length).toBeGreaterThan(0)
      for (const tier of ['draft', 'standard', 'premium'] as const) {
        const model = getModel(template.models[tier])
        expect(model, `${tier}: model missing`).toBeDefined()
        if (!model || model.type !== 'video') throw new Error('not a video model')
        // Ascending price is not enforced by the code, but a "premium" tier that
        // costs less than "standard" would be a UI that makes no sense.
        const total = clips.reduce(
          (sum, c) => sum + (model.creditsByDuration[String(c.durationSeconds)] ?? 0),
          0,
        )
        expect(total, `${tier}: total is zero — a duration is not priced`).toBeGreaterThan(0)
      }

      const totals = (['draft', 'standard', 'premium'] as const).map((tier) => {
        const model = getModel(template.models[tier])
        if (!model || model.type !== 'video') throw new Error('not a video model')
        return clips.reduce(
          (sum, c) => sum + (model.creditsByDuration[String(c.durationSeconds)] ?? 0),
          0,
        )
      })
      expect(totals[0]!).toBeLessThan(totals[1]!)
      expect(totals[1]!).toBeLessThan(totals[2]!)
    })

    it('shot copy fits the wire limits after substitution', () => {
      // Titles cap at 200 chars and voice lines at 600 on the wire (film.ts). The
      // template's own text must fit BEFORE substitution grows it, or the service
      // silently truncates mid-sentence.
      for (const shot of template.shots) {
        if (shot.title) expect(shot.title.text.length).toBeLessThanOrEqual(150)
        if (isClip(shot) && shot.voiceover)
          expect(shot.voiceover.text.length).toBeLessThanOrEqual(400)
        if (isClip(shot)) expect(shot.prompt.length).toBeLessThanOrEqual(2000)
      }
    })

    it('a title card carries no prompt and no cost', () => {
      for (const shot of template.shots) {
        if (isClip(shot)) continue
        expect(shot.title.text.length).toBeGreaterThan(0)
      }
    })

    it('declares a disclosure tier the contract recognises', () => {
      // Required rather than optional on the type, so the compiler already
      // guarantees SOMETHING is there — this asserts it is one of the three the
      // wire will accept, which the compiler cannot see for catalog data any more
      // than it can see a model id. Retrofitting provenance onto a shipped
      // catalog costs far more than carrying the field (ADR shorts-studio §12).
      expect(DISCLOSURE_TIERS).toContain(template.disclosureTier)
    })

    it('backs a loopable claim in its final clip beat', () => {
      // THE ONE THAT CAN ACTUALLY CATCH A LIE. `loopable` is a promise made to the
      // gallery — since 2025-03-31 a replay counts as a view, so a user filters on
      // this field and picks the card because of it. But a model does not infer
      // "the last frame should equal the first"; it has to be told, in the prompt,
      // every time. So a template that declares the loop without ASKING for it
      // ships a clip that visibly jumps at the seam, which is worse than never
      // claiming the loop.
      //
      // Matching on the authored prompt text is crude on purpose: the alternative
      // is trusting a boolean nobody can verify. If this fires, the fix is almost
      // never to loosen the matcher — it is that the template is lying, or that
      // its last beat lost the frame-match sentence in an edit (ADR §10).
      if (!template.loopable) return
      const clips = template.shots.filter(isClip)
      const last = clips.at(-1)
      expect(last, 'a loopable template with no clips').toBeDefined()
      const prompt = last!.prompt.toLowerCase()
      const saysReturn =
        prompt.includes('match the opening composition') ||
        prompt.includes('matches the opening composition')
      expect(
        saysReturn,
        `${template.id}: loopable is true but the final beat ("${last!.beat}") never ` +
          'asks the model to return to the opening frame',
      ).toBe(true)
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The SHORTS shelf («Шортсы», ADR shorts-studio). Like the brick shelf above,
// these are promises of THIS PACK rather than of templates in general — and here
// they are arithmetic rather than taste. The vertical triple's native duration
// tables intersect at exactly {8} (§6), so a shorts card has one legal clip
// length; three beats is the loop sweet spot (§10); and the knob budget is a
// stated discipline (§8) with at least one knob that changes what is ON SCREEN,
// which is the feature's licence to exist under YouTube's inauthentic-content
// policy (§9).
//
// The payoff of the uniform shape is the batch runner's: every card costs the
// same, so the itemised confirm is rows × beats × one number.
// ─────────────────────────────────────────────────────────────────────────────
const SHORTS = TEMPLATES.filter((t) => t.category === 'shorts')

describe('shorts shelf', () => {
  it('ships the eleven formats the shelf claims, in gallery order', () => {
    // 'shorts-figurine-pov' is authored but deliberately NOT registered: its
    // format needs a tier that can hold a character across shots, and the only
    // such tier model is unreachable on this deployment, so the one tier that
    // runs is the one tier that cannot do the card's job. See the note in
    // catalog/index.ts and that file's own header for the return condition.
    expect(SHORTS.map((t) => t.id)).toEqual([
      'shorts-asmr-impossible',
      'shorts-lofi-loop',
      'shorts-timelapse-cycle',
      'shorts-b-roll',
      'shorts-pov-immersion',
      'shorts-talking-object',
      'shorts-absurd-creature',
      'shorts-stylised-everyday',
      'shorts-cold-open-loop',
      'shorts-what-if-doc',
      'shorts-ai-slop',
    ])
  })

  it('never reaches the in-player disclosure tier', () => {
    // §12: the shelf leads with stylised and no-face formats precisely because
    // they are cheaper, more reliable AND less policy-exposed. A shorts card that
    // needs an in-player label is a talking-head format that wandered onto the
    // wrong shelf — those ship later, and knowingly.
    for (const t of SHORTS) expect(t.disclosureTier, t.id).not.toBe('in-player')
  })

  describe.each(SHORTS.map((t) => [t.id, t] as const))('%s', (_id, template) => {
    it('is vertical on the shelf triple, and says which tiers actually work', () => {
      // The triple changed on 2026-08-20 and the reason was deployment reality,
      // not craft: pixverse-v6 (draft) routes to Runware, whose production key is
      // a placeholder, so the whole shelf passed every check here and then failed
      // on the first real click. seedance-1-5-pro runs on kie.ai, which is
      // verified working in production, and it costs the SAME 56 credits at 8s —
      // so the swap changed no price and no beat. Standard and premium are left
      // pointing at providers this deployment cannot reach yet, deliberately:
      // aiming all three tiers at one working model would make the tier picker a
      // lie. What we owe the user is the truth on the pill, so this test also
      // pins that EVERY tier carries a note — an unreachable tier with a silent
      // pill is the exact trap the change exists to remove.
      expect(template.aspectRatio).toBe('9:16')
      expect(template.models).toEqual({
        draft: 'seedance-1-5-pro',
        standard: 'wan-2-7',
        premium: 'veo-3-1-fast',
      })
      for (const tier of ['draft', 'standard', 'premium'] as const)
        expect(template.tierNotes?.[tier]?.length, `${tier}: no note`).toBeGreaterThan(0)
    })

    it('is 3 or 4 beats, every one of them a paid 8s clip', () => {
      // 8 is the intersection of the three tier models' native duration tables,
      // so it is the only legal length here — assertTemplatesValid would fail the
      // deploy on anything else, but this says WHY rather than just that.
      const clips = template.shots.filter(isClip)
      expect(clips.length).toBe(template.shots.length)
      expect(clips.length).toBeGreaterThanOrEqual(3)
      expect(clips.length).toBeLessThanOrEqual(4)
      for (const c of clips) expect(c.durationSeconds, c.beat).toBe(8)
    })

    it('has at most three knobs, and at least one that changes the picture', () => {
      // §8: more than three knobs is a Cinema template wearing the wrong shelf.
      // §9: a batch VARIES by default — a template whose only knob is cosmetic is
      // a machine for producing N identical clips, which is the named
      // demonetisation trigger this shelf exists downstream of. "Changes the
      // picture" is checked as "some select knob is substituted into a visual
      // prompt", which is the closest a test can get to it.
      expect(template.variables.length).toBeLessThanOrEqual(3)
      const selectKeys = new Set(
        template.variables.filter((v) => v.kind === 'select').map((v) => v.key),
      )
      const inVisualPrompts = new Set(
        template.shots
          .flatMap((s) => stringsOf(s))
          .filter((f) => f.visual)
          .flatMap((f) => placeholdersIn(f.text)),
      )
      const onScreen = [...selectKeys].filter((k) => inVisualPrompts.has(k))
      expect(
        onScreen.length,
        `${template.id}: no knob reaches a visual prompt — every batch row would look identical`,
      ).toBeGreaterThan(0)
    })

    it('never asks the model to render text, and frames for the platform UI', () => {
      // §11, the two prompt-level constraints. Text rendering is the one bad
      // failure mode that is free to eliminate, and the platform's own UI eats the
      // bottom ~26% of a 9:16 frame — so both belong in every authored prompt, not
      // in a compositor step nobody has built yet.
      for (const shot of template.shots) {
        if (!isClip(shot)) continue
        const p = shot.prompt.toLowerCase()
        expect(p, `${shot.beat}: no text suppression`).toContain('no text anywhere in frame')
        expect(p, `${shot.beat}: no safe-area framing`).toContain('upper two thirds')
        expect(p, `${shot.beat}: no empty lower third`).toContain('lower third')
      }
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The brick shelf («Брик-мульты») has promises the generic invariants above do
// not cover, because they are promises of THIS PACK rather than of templates in
// general: a whole shelf sold as "восемь готовых историй" has to actually hold
// eight, each has to be a story (an arc that resolves, not a look), each has to
// speak, and each has to cost about the same as its neighbours — a shelf where
// one card is 280 credits and the next is 840 reads as a pricing bug.
//
// The pack is authored to a deliberately narrow shape: 5–6 paid clips plus 1–2
// free cards. The floor is dramatic (five beats is the minimum that carries
// setup → turn → resolution) and the ceiling is economic (a seventh clip pushes
// the premium tier past ~1000 credits, which is where the format stops being an
// impulse purchase).
// ─────────────────────────────────────────────────────────────────────────────
const BRICK = TEMPLATES.filter((t) => t.category === 'brick')

describe('brick shelf', () => {
  it('ships the eight stories the shelf claims', () => {
    expect(BRICK.map((t) => t.id)).toEqual([
      'brick-heist',
      'brick-space',
      'brick-race',
      'brick-castle',
      'brick-build',
      'brick-noir',
      'brick-pirates',
      'brick-city',
    ])
  })

  describe.each(BRICK.map((t) => [t.id, t] as const))('%s', (_id, template) => {
    it('is 5–6 paid clips plus 1–2 free cards', () => {
      const clips = template.shots.filter(isClip)
      const cards = template.shots.length - clips.length
      expect(clips.length).toBeGreaterThanOrEqual(5)
      expect(clips.length).toBeLessThanOrEqual(6)
      expect(cards).toBeGreaterThanOrEqual(1)
      expect(cards).toBeLessThanOrEqual(2)
    })

    it('speaks on every paid beat', () => {
      // A brickfilm without dialogue is a slideshow of toys. The Russian lines are
      // the performance, and on the premium tier the model generates them itself —
      // so a silent beat is a beat that pays for the expensive model and wastes it.
      for (const shot of template.shots)
        if (isClip(shot)) expect(shot.voiceover?.text.length, shot.beat).toBeGreaterThan(0)
    })

    it('has 2–3 knobs, at most one of them free text', () => {
      // The closed rule: a select is validated against its option set before it can
      // reach a paid prompt; free text cannot be. One text knob per story is the
      // budget, and it only ever lands in a spoken line or a card (asserted for
      // every template by the free-text test above).
      expect(template.variables.length).toBeGreaterThanOrEqual(2)
      expect(template.variables.length).toBeLessThanOrEqual(3)
      expect(template.variables.filter((v) => v.kind === 'text').length).toBeLessThanOrEqual(1)
    })

    it('tells the audio panel what it wants, and says why premium costs more', () => {
      expect(template.musicPrompt?.length, 'musicPrompt').toBeGreaterThan(0)
      expect(template.tierNotes?.premium?.length, 'tierNotes.premium').toBeGreaterThan(0)
    })
  })
})
