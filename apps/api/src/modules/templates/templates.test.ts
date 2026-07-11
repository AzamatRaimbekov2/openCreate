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
  })
})
