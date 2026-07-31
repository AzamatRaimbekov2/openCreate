// apps/api/src/modules/templates/types.ts
// The SERVER-SIDE shape of a template — the thing the wire contract
// (packages/contracts/src/templates.ts) deliberately does not carry.
//
// ADR: docs/wiki/decisions/template-catalog.md
//
// A Template is a pre-authored film: N beats, each with a finished prompt, a
// camera/style preset, a duration, an on-screen title and a spoken line. The
// user turns two or three knobs and lands in the Cinema editor with a timeline
// already built and nothing generated yet.
//
// WHY THESE TYPES LIVE HERE AND NOT IN CONTRACTS
// Because none of this travels. The client gets a TemplateSummary (the pitch:
// name, beat sheet, prices, knobs) and posts back knob VALUES. The prompt text,
// and the English fragment each knob option expands to, stay on this side. That
// keeps the SPA bundle flat as the catalog grows, keeps the prompts (which are
// the actual product) off a public endpoint, and preserves the composition law
// from presets.ts: the client sends structured ids, the server builds what the
// model sees.
import type {
  AspectRatio,
  BuiltinStyleId,
  PromptPreset,
  TemplateCategory,
  TemplateTier,
  TitlePosition,
  Transition,
} from '@opencreate/contracts'

// ─────────────────────────────────────────────────────────────────────────────
// A knob option. Note it carries THREE strings, not one label.
//
// `prompt` is the English staging fragment ("a sly red fox in a tailored suit").
// `spoken` is the Russian noun the characters actually say ("лис").
// `label` is what the picker shows.
//
// They are separate because the same choice lands in two places that want
// different languages: the video models are markedly better at English staging
// direction, while the TTS line and the burned-in title are Russian. Substituting
// one string into both would give you either a Russian video prompt (worse
// footage) or an English subtitle (wrong product). See `substitute()` in
// service.ts — visual prompts take `prompt`, titles and voice lines take `spoken`.
// ─────────────────────────────────────────────────────────────────────────────
export type TemplateOption = {
  value: string
  label: string
  prompt: string
  // Defaults to `label` when the label is already the right spoken form.
  spoken?: string
}

export type TemplateVariableDef =
  | {
      key: string
      kind: 'select'
      label: string
      hint?: string
      defaultValue: string
      options: TemplateOption[]
    }
  | {
      key: string
      kind: 'text'
      label: string
      hint?: string
      defaultValue: string
      maxLength: number
      // A free-text knob is NEVER substituted into a visual prompt — only into
      // spoken lines and titles. Enforced by a test, because the failure mode is
      // silent: a Russian sentence pasted into a Veo prompt does not error, it
      // just quietly produces worse footage. (And an unbounded string reaching a
      // prompt is a hole we would rather not have at all.)
    }

// ─────────────────────────────────────────────────────────────────────────────
// A beat. Either a generated clip (costs credits) or a title card (free).
//
// The union is explicit rather than "a clip is a shot with a prompt" because the
// distinction drives the price: the catalog card promises "8 beats, 6 of them
// generated", and clipCount is what every tier's total is multiplied by.
// ─────────────────────────────────────────────────────────────────────────────
type BeatBase = {
  // Shown on the card's beat sheet — "Разоблачение". Not a prompt; a label.
  beat: string
  durationSeconds: number
  transition?: Transition
  transitionMs?: number
  title?: { text: string; position: TitlePosition }
}

export type TemplateClip = BeatBase & {
  kind: 'clip'
  // {{key}} placeholders expand to the option's `prompt` (English).
  prompt: string
  preset: PromptPreset
  // {{key}} placeholders expand to the option's `spoken` (Russian).
  voiceover?: { text: string; voice: string }
}

export type TemplateTitleCard = BeatBase & {
  kind: 'title'
  // A title card is nothing but its title, so it is required here (on BeatBase it
  // is optional, because a clip may or may not carry an overlay).
  title: { text: string; position: TitlePosition }
}

export type TemplateShot = TemplateClip | TemplateTitleCard

export const isClip = (s: TemplateShot): s is TemplateClip => s.kind === 'clip'

// ─────────────────────────────────────────────────────────────────────────────
// The template itself.
// ─────────────────────────────────────────────────────────────────────────────
export type Template = {
  id: string
  category: TemplateCategory
  name: string
  tagline: string
  description: string
  aspectRatio: AspectRatio
  // BUILTIN styles only, deliberately narrower than the wire's open styleId
  // (ADR style-studio D1). A template is authored in code, shipped to every
  // user, and instantiated on their behalf — it cannot cite a style that lives
  // in one user's `style` table. Keeping the enum here means a typo in a catalog
  // file is a compile error rather than a film that 400s at generate time.
  defaultStyleId: BuiltinStyleId | null
  // The film's title, with {{key}} placeholders — "Клубника и {{lover}}".
  titleTemplate: string

  // The model per price tier. THE INVARIANT: every one of these must natively
  // support this template's aspectRatio AND every clip's durationSeconds.
  // Otherwise composeShotClipInput silently snaps the duration to the nearest
  // legal value, changing both the cut and the price behind the user's back.
  // Asserted for every template × tier in templates.test.ts — the type system
  // cannot see catalog data, so a test has to.
  models: Record<TemplateTier, string>
  // Why a tier is worth its price, when it is not obvious from the number.
  // Shown on the tier pill: premium's is "говорит вслух" (native audio).
  tierNotes?: Partial<Record<TemplateTier, string>>

  // The music bed this format wants, as a prompt for the `music` catalog model.
  // Unlike the shot prompts this DOES go on the wire (TemplateSummary.musicPrompt)
  // — it is one line, and pre-filling the audio panel with it is the whole point.
  musicPrompt?: string

  variables: TemplateVariableDef[]
  shots: TemplateShot[]
}
