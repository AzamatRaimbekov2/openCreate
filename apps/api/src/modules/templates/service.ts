// apps/api/src/modules/templates/service.ts
// Turns a Template (server-side prose + structure) into two things:
//   · a TemplateSummary — the pitch the gallery renders, priced from the LIVE
//     catalog so the number on the card cannot drift from what the generation
//     endpoint will actually charge;
//   · a film — the project row plus every shot, with {{variables}} substituted,
//     the tier's model pinned, and NOTHING generated.
//
// ADR: docs/wiki/decisions/template-catalog.md
//
// THE RULE THAT SHAPES THIS FILE: applying a template is free. Every shot lands
// with generationId = null. The prompts, presets, model, durations, titles and
// spoken lines are all filled in — but the credits are spent later, per shot, by
// a user who has now actually SEEN the shots. A one-click "spend 1120 credits"
// button would be a trap, and a lie: the first thing anyone does with a template
// is change one beat.
import type {
  CatalogAudioModel,
  CreateFilmFromTemplateInput,
  CreateShotInput,
  FilmDetail,
  TemplateSummary,
  TemplateTierOffer,
} from '@opencreate/contracts'
import { TEMPLATE_TIERS } from '@opencreate/contracts'
import { CATALOG, creditsFor, getModel } from '../catalog/catalog'
import type { FilmService } from '../films/service'
import { getTemplate, TEMPLATES } from './catalog'
import { isClip, type Template, type TemplateVariableDef } from './types'

export class TemplateNotFoundError extends Error {
  statusCode = 404
  apiCode = 'not_found'
  constructor() {
    super('template not found')
  }
}
export class TemplateValidationError extends Error {
  statusCode = 400
  apiCode = 'validation_failed'
}

// A resolved knob: the same choice in the two languages it lands in. `prompt` is
// the English staging fragment the video model sees; `spoken` is the Russian noun
// (or the literal voice id) that goes into titles and voice lines. See types.ts.
type ResolvedVar = { prompt: string; spoken: string }

// ─────────────────────────────────────────────────────────────────────────────
// Substitution. Two modes, and picking the wrong one is a silent bug — a Russian
// noun in a Veo prompt does not error, it just quietly makes worse footage.
//
// An unknown {{key}} is left verbatim rather than blanked. Blanking would produce
// a subtly broken prompt that still generates (and still charges); leaving the
// braces in makes the mistake visible in the shot the user is about to read.
// It cannot happen at runtime anyway — the placeholder set is asserted against
// the variable set in templates.test.ts.
// ─────────────────────────────────────────────────────────────────────────────
const PLACEHOLDER = /\{\{(\w+)\}\}/g

function substitute(text: string, vars: Map<string, ResolvedVar>, mode: 'prompt' | 'spoken'): string {
  return text.replace(PLACEHOLDER, (whole, key: string) => {
    const v = vars.get(key)
    if (!v) return whole
    return mode === 'prompt' ? v.prompt : v.spoken
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Knob validation. This is a trust boundary: `variables` arrives from the client
// as an untyped string map, and its values end up inside a prompt we pay a
// provider to render. So: unknown keys are rejected outright, select values must
// name a declared option, and free text is length-capped.
//
// The strictness on unknown keys is deliberate. Silently ignoring a key the
// client thought mattered means the user gets a film that doesn't match what they
// picked and has no way to tell why.
// ─────────────────────────────────────────────────────────────────────────────
function resolveVars(
  template: Template,
  supplied: Record<string, string>,
): Map<string, ResolvedVar> {
  const declared = new Set(template.variables.map((v) => v.key))
  for (const key of Object.keys(supplied)) {
    if (!declared.has(key)) throw new TemplateValidationError(`unknown variable: ${key}`)
  }

  const resolved = new Map<string, ResolvedVar>()
  for (const def of template.variables) {
    const raw = supplied[def.key] ?? def.defaultValue
    resolved.set(def.key, resolveOne(def, raw))
  }
  return resolved
}

function resolveOne(def: TemplateVariableDef, raw: string): ResolvedVar {
  if (def.kind === 'select') {
    const option = def.options.find((o) => o.value === raw)
    if (!option) throw new TemplateValidationError(`invalid value for ${def.key}: ${raw}`)
    // `spoken` falls back to the label when the label already IS the right spoken
    // form ("Клубника" → "клубника" reads fine mid-sentence).
    return { prompt: option.prompt, spoken: option.spoken ?? option.label.toLowerCase() }
  }
  const text = raw.trim()
  if (text.length === 0) throw new TemplateValidationError(`${def.key} must not be empty`)
  if (text.length > def.maxLength)
    throw new TemplateValidationError(`${def.key} exceeds ${def.maxLength} characters`)
  // Both modes get the raw text. A text variable is never substituted into a
  // visual prompt (asserted in templates.test.ts), so `prompt` here is unreachable
  // in practice — it exists so the type stays uniform.
  return { prompt: text, spoken: text }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pricing. Computed, never authored — the catalog is the single source of truth
// for what a clip costs, and a hardcoded number on a template would go stale the
// first time a provider changes its rate.
//
// Title cards are excluded because they cost nothing: they carry no generation,
// ffmpeg draws them over black at render time. That is why the card can honestly
// say "9 битов, 8 из них платные".
// ─────────────────────────────────────────────────────────────────────────────
function priceTiers(template: Template): TemplateTierOffer[] {
  const clips = template.shots.filter(isClip)
  return TEMPLATE_TIERS.map((tier) => {
    const modelId = template.models[tier]
    const model = getModel(modelId)
    // Unreachable past assertTemplatesValid(), which runs at boot. If it ever
    // fires it means a model was removed from the catalog without updating the
    // templates that pinned it — a deploy-time mistake, not a user's problem.
    if (!model) throw new Error(`template ${template.id}: unknown model ${modelId}`)
    const credits = clips.reduce((sum, clip) => sum + creditsFor(model, clip.durationSeconds), 0)
    return {
      tier,
      modelId,
      modelName: model.name,
      credits,
      note: template.tierNotes?.[tier] ?? null,
    }
  })
}

export function toSummary(template: Template): TemplateSummary {
  const clips = template.shots.filter(isClip)
  return {
    id: template.id,
    category: template.category,
    name: template.name,
    tagline: template.tagline,
    description: template.description,
    // Null until we have actually rendered an example of this template. The
    // gallery draws a typographic card rather than a grey box pretending to be a
    // video — a fake thumbnail is worse than none.
    previewUrl: null,
    aspectRatio: template.aspectRatio,
    shotCount: template.shots.length,
    clipCount: clips.length,
    totalDurationSeconds: template.shots.reduce((sum, s) => sum + s.durationSeconds, 0),
    beats: template.shots.map((s) => ({
      label: s.beat,
      durationSeconds: s.durationSeconds,
      generated: isClip(s),
    })),
    tiers: priceTiers(template),
    variables: template.variables.map((v) =>
      v.kind === 'select'
        ? {
            key: v.key,
            kind: 'select' as const,
            label: v.label,
            ...(v.hint ? { hint: v.hint } : {}),
            defaultValue: v.defaultValue,
            // Only { value, label } crosses the wire — the English prompt fragment
            // each option expands to stays here (see templates.ts's header).
            options: v.options.map((o) => ({ value: o.value, label: o.label })),
          }
        : {
            key: v.key,
            kind: 'text' as const,
            label: v.label,
            ...(v.hint ? { hint: v.hint } : {}),
            defaultValue: v.defaultValue,
            maxLength: v.maxLength,
          },
    ),
    hasVoiceover: clips.some((c) => c.voiceover !== undefined),
    musicPrompt: template.musicPrompt ?? null,
  }
}

export function listTemplates(): TemplateSummary[] {
  return TEMPLATES.map(toSummary)
}

// ─────────────────────────────────────────────────────────────────────────────
// The voices the TTS model actually offers, read from the live catalog rather
// than frozen in a template. A provider retiring a voice must fail loudly HERE,
// at instantiation, rather than silently producing a wrong-sounding track (or a
// provider 400) eight credits later.
// ─────────────────────────────────────────────────────────────────────────────
function catalogVoices(): string[] {
  const tts = CATALOG.find(
    (m): m is CatalogAudioModel => m.type === 'audio' && m.audioKind === 'tts',
  )
  return tts?.voices ?? []
}

export type TemplateService = ReturnType<typeof createTemplateService>

export function createTemplateService({ films }: { films: FilmService }) {
  function instantiate(userId: string, input: CreateFilmFromTemplateInput): FilmDetail {
    const template = getTemplate(input.templateId)
    if (!template) throw new TemplateNotFoundError()

    const vars = resolveVars(template, input.variables)
    // The tier IS the model choice — pinned onto every generated shot, which is
    // the whole reason shot.modelId exists.
    const modelId = template.models[input.tier]
    const voices = catalogVoices()

    const shots: CreateShotInput[] = template.shots.map((s) => {
      const title = s.title
        ? { text: substitute(s.title.text, vars, 'spoken').slice(0, 200), position: s.title.position }
        : null

      if (!isClip(s)) {
        // A title card: no prompt, no model, no cost. generationId stays null and
        // the renderer draws the text over black for durationSeconds.
        return {
          generationId: null,
          prompt: '',
          promptPreset: null,
          modelId: null,
          durationMs: s.durationSeconds * 1000,
          ...(s.transition ? { transition: s.transition } : {}),
          ...(s.transitionMs !== undefined ? { transitionMs: s.transitionMs } : {}),
          title,
          voiceover: null,
        }
      }

      let voiceover: CreateShotInput['voiceover'] = null
      if (s.voiceover) {
        const voice = substitute(s.voiceover.voice, vars, 'spoken')
        if (voices.length > 0 && !voices.includes(voice))
          throw new TemplateValidationError(`voice "${voice}" is not offered by the catalog`)
        // The wire caps a spoken line at 600 chars; a user's free-text script is
        // capped well below that, so this can only trim pathological input.
        const text = substitute(s.voiceover.text, vars, 'spoken').slice(0, 600)
        voiceover = { text, voice }
      }

      return {
        generationId: null,
        prompt: substitute(s.prompt, vars, 'prompt'),
        promptPreset: s.preset,
        modelId,
        durationMs: s.durationSeconds * 1000,
        ...(s.transition ? { transition: s.transition } : {}),
        ...(s.transitionMs !== undefined ? { transitionMs: s.transitionMs } : {}),
        title,
        voiceover,
      }
    })

    const title = (input.title ?? substitute(template.titleTemplate, vars, 'spoken'))
      .trim()
      .slice(0, 120)

    return films.createFromTemplate(
      userId,
      template.id,
      { title, aspectRatio: template.aspectRatio, defaultStyleId: template.defaultStyleId },
      shots,
    )
  }

  return { list: listTemplates, instantiate }
}

// ─────────────────────────────────────────────────────────────────────────────
// Boot-time assertion (wired in app.ts). The type system cannot see catalog data,
// so the invariant that makes a template's price honest has to be checked at
// runtime — and it has to be checked at BOOT, not per request, so a bad template
// is a failed deploy rather than a 500 the first user finds.
//
// THE INVARIANT: every tier model must be a video model that natively supports
// the template's aspect ratio AND every clip's duration. If it doesn't,
// composeShotClipInput snaps the duration to the nearest legal value — quietly
// changing both the cut the user was promised and the price they were quoted.
// ─────────────────────────────────────────────────────────────────────────────
export function assertTemplatesValid(templates: Template[] = TEMPLATES): void {
  for (const t of templates) {
    for (const tier of TEMPLATE_TIERS) {
      const modelId = t.models[tier]
      const model = getModel(modelId)
      if (!model) throw new Error(`template ${t.id} / ${tier}: model "${modelId}" is not in the catalog`)
      if (model.type !== 'video')
        throw new Error(`template ${t.id} / ${tier}: model "${modelId}" is not a video model`)
      if (!model.aspectRatios.includes(t.aspectRatio))
        throw new Error(
          `template ${t.id} / ${tier}: model "${modelId}" does not support ${t.aspectRatio}`,
        )
      for (const clip of t.shots.filter(isClip)) {
        if (!model.durationOptions.includes(clip.durationSeconds))
          throw new Error(
            `template ${t.id} / ${tier}: model "${modelId}" cannot do ${clip.durationSeconds}s ` +
              `(beat "${clip.beat}"); it offers ${model.durationOptions.join('/')}s`,
          )
      }
    }
  }
}
