// packages/contracts/src/templates.ts
// Template catalog wire contracts: what the /templates gallery shows and what a
// "create film from this template" request carries.
//
// ADR: docs/wiki/decisions/template-catalog.md
//
// WHAT TRAVELS AND WHAT DOES NOT — the one thing to understand about this file.
// A Template's authored prompts (eight paragraphs of camera/lighting/staging
// direction per drama) are NOT on the wire and are NOT in this package. They
// live server-side in apps/api/src/modules/templates/catalog/ and are substituted
// into shot.prompt at instantiation. The client never sees a template's prompt
// text — it sees the PITCH (name, beats, cost, the knobs it can turn) and posts
// back only the knob VALUES. Three reasons:
//   1. The catalog is meant to grow to hundreds of templates; shipping every
//      prompt into the SPA bundle would cost more than the feature is worth.
//   2. The prompts are the product. Anything on the wire is public.
//   3. It keeps the composition law intact (see presets.ts): the SERVER builds
//      what the model sees. The client sends structured ids, never prose.
// The prompts do become visible — as shot.prompt, editable, once the film exists.
// That is deliberate: a template is a starting point the user then owns.
import { z } from 'zod'
import { aspectRatioSchema } from './catalog'
import { filmDetailSchema } from './film'

// ─────────────────────────────────────────────────────────────────────────────
// Category — the shelf a template sits on in the gallery. An enum rather than a
// free string so the rail's tabs are exhaustive and typo-proof; adding a shelf is
// a deliberate contract change, which is what we want while the catalog is small.
// ─────────────────────────────────────────────────────────────────────────────
//
// 'animation' is the second shelf, and it is a genuinely different product from
// 'brainrot': an authored hand-drawn short (one scene, four hard cuts, a spoken
// performance) rather than a 30-second viral format. It gets its own shelf rather
// than being filed under brainrot because the two want different things from the
// user — a brainrot template is picked to be posted, an animation template is
// picked to be *edited*.
//
// 'format' (2026-07-18, owner request) is the third shelf: LOOK/GENRE scaffolds
// — «Фильм», «Сериал», «Аниме» — a ready beat structure in a format's visual
// language that the user re-aims with a couple of knobs and then edits. Unlike
// a brainrot template (a finished joke) a format template is a starting grid:
// picked to be *rewritten*, beat by beat, in the Cinema editor.
//
// 'brick' (2026-07-30, owner request «лего-мультфильмы с историями») is the
// fourth shelf: stop-motion brickfilms — plastic-construction-brick worlds and
// minifigure casts playing out eight complete short stories (a heist, a space
// rescue, a castle escape…). It is not a brainrot format and not a 'format'
// scaffold: a brainrot template is a joke picked to be posted and a format
// template is a grid picked to be rewritten, while a brick template is a STORY
// picked to be watched — an arc that resolves, with a beginning and an end,
// which is why the pack is authored as eight distinct plots rather than one
// look with knobs.
//
// NOTE FOR ANYONE ADDING TO THIS SHELF: the toy brand's name appears nowhere in
// the catalog, and that is enforced by a test (templates.test.ts, "names no
// trademark the providers moderate on"). It is both someone else's registered
// mark and a phrase Veo's moderation rejects — which would break the premium
// tier only, silently. The aesthetic vocabulary is "plastic construction
// bricks", "minifigure", "brickfilm", "visible brick studs".
//
// 'shorts' (2026-08-20, ADR shorts-studio §1) is the fifth shelf, and it is the
// only one that exists for a RUNNER rather than for a genre: a shorts template is
// an ordinary Template with aspectRatio '9:16' and few beats, picked to be run in
// a BATCH — N films from one template and N rows of knob values. There is no new
// media type behind it and no new render path; a finished short is a film.
//
// It is a shelf and not a flag because the gallery groups by category and nothing
// else: widening this enum is the entire client-side existence of the shelf.
export const templateCategorySchema = z.enum([
  'format',
  'brainrot',
  'animation',
  'brick',
  'shorts',
])
export type TemplateCategory = z.infer<typeof templateCategorySchema>

// ─────────────────────────────────────────────────────────────────────────────
// Tier — the price/quality knob, and the ONLY thing that picks a model.
//
// A template does not name one model; it names one PER TIER, and the tier the
// user picks is pinned onto every generated shot (shot.modelId). This exists
// because these formats are expensive: a canonical eight-beat drama is ~450
// credits on the cheap model and ~1120 on the one that can actually speak. A
// single hardcoded model would either price out most users or ship a version of
// the format that doesn't work. So the price is a choice, made once, up front,
// with the number shown before the click.
//
// The invariant that makes this safe: every tier model must natively support
// every clip's duration AND the template's aspect ratio. If it didn't,
// composeShotClipInput would silently snap an 8s beat to the nearest legal
// value — changing both the cut and the price behind the user's back. A contract
// test in the API asserts this for every template × tier; see
// modules/templates/templates.test.ts.
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// Disclosure tier — how much AI-provenance labelling a template's output needs
// (ADR shorts-studio §12). It is a REQUIRED field on every template, not an
// optional one, and that is the entire design: an optional compliance field is a
// field nobody fills in, and retrofitting provenance onto a shipped catalog costs
// far more than carrying the value from day one. The EU already requires
// machine-readable provenance on AI ad content.
//
// The three tiers, and the axis that separates them:
//   · 'none'        — stylised AND fantastical. A minifigure world, a cel-shaded
//                     shonen battle, a snail with a lion's mane. Nothing a viewer
//                     could mistake for a record of something that happened.
//   · 'description' — either a non-photoreal rendering of things that COULD be
//                     real (a hand-drawn human drama), or a photoreal rendering
//                     of something that plainly could not be (macro fruit with
//                     eyes). The label goes in the expanded description.
//   · 'in-player'   — photoreal PEOPLE, IDENTIFIABLE PLACES or EVENTS. The label
//                     rides in the player on YouTube, and TikTok's C2PA detection
//                     applies it whether we self-disclose or not.
//
// WHEN A TEMPLATE SITS BETWEEN TWO TIERS, TAKE THE HIGHER ONE. Over-labelling
// costs a line of description; under-labelling a photoreal human drama is a
// policy exposure, and the asymmetry is not close.
//
// It travels on the wire (unlike the shot prompts) because two consumers outside
// the catalog need it: the gallery, which can warn before a user commits to a
// format they will have to label, and the export, which will stamp the label
// from it.
export const disclosureTierSchema = z.enum(['none', 'description', 'in-player'])
export type DisclosureTier = z.infer<typeof disclosureTierSchema>

// The same three values as a runtime list, mirroring TEMPLATE_TIERS below. The
// catalog test iterates it to assert every authored template names a tier the
// wire will accept — the type system cannot see catalog data, so a test has to.
export const DISCLOSURE_TIERS = [
  'none',
  'description',
  'in-player',
] as const satisfies readonly DisclosureTier[]

export const templateTierSchema = z.enum(['draft', 'standard', 'premium'])
export type TemplateTier = z.infer<typeof templateTierSchema>

export const TEMPLATE_TIERS = ['draft', 'standard', 'premium'] as const satisfies readonly TemplateTier[]

// ─────────────────────────────────────────────────────────────────────────────
// Variables — the knobs. A template is a story with holes in it ("{{wife}} finds
// {{husband}} with {{lover}}"); a variable declares one hole, and the client
// renders a picker for it.
//
// A select option carries only { value, label } on the wire. The English prompt
// fragment each option expands to (`лис` → `a sly red fox in a tailored suit`)
// stays server-side — the client posts back the VALUE, and the server looks up
// the fragment. This is the same client-sends-ids/server-composes rule as
// presets.ts, and it is why a select is strictly safer than a text field: the
// value is validated against a closed set before it can reach a prompt.
// ─────────────────────────────────────────────────────────────────────────────
export const templateVariableOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
})
export type TemplateVariableOption = z.infer<typeof templateVariableOptionSchema>

export const templateVariableSchema = z.object({
  // The {{placeholder}} name this fills.
  key: z.string(),
  kind: z.enum(['select', 'text']),
  label: z.string(),
  hint: z.string().optional(),
  defaultValue: z.string(),
  // Present iff kind === 'select'. The closed set of legal values.
  options: z.array(templateVariableOptionSchema).optional(),
  // Present iff kind === 'text'. Free text — only ever substituted into spoken
  // lines and on-screen titles, never into a visual prompt (the video models are
  // markedly worse at non-English staging direction, and free text in a prompt
  // is a hole we would rather not have).
  maxLength: z.number().int().positive().optional(),
})
export type TemplateVariable = z.infer<typeof templateVariableSchema>

// ─────────────────────────────────────────────────────────────────────────────
// The pitch — everything the gallery needs to sell a template WITHOUT its prompts.
// ─────────────────────────────────────────────────────────────────────────────

// One row of the beat sheet shown on the card: "Разоблачение · 8с". `generated`
// is false for a title card, which costs nothing and is why clipCount and
// shotCount differ — the user should be able to see that 2 of the 8 beats are free.
export const templateBeatSchema = z.object({
  label: z.string(),
  durationSeconds: z.number().int().positive(),
  generated: z.boolean(),
})
export type TemplateBeat = z.infer<typeof templateBeatSchema>

// A priced offer. `credits` is the TOTAL for every generated clip in the template
// at this tier — the number the user is deciding against, not a per-shot rate.
// Computed server-side from the live catalog, never authored, so it cannot drift
// away from what the generation endpoint will actually charge.
export const templateTierOfferSchema = z.object({
  tier: templateTierSchema,
  modelId: z.string(),
  // The catalog's display name for the model ("Swift", "Cinema", "Premiere") —
  // resolved server-side so the client needs no catalog join to render the pill.
  modelName: z.string(),
  credits: z.number().int().min(0),
  // Set when the tier does something the others don't, e.g. native spoken audio.
  // The gallery shows it as the reason to pay more; null = no special claim.
  note: z.string().nullable(),
})
export type TemplateTierOffer = z.infer<typeof templateTierOfferSchema>

export const templateSummarySchema = z.object({
  id: z.string(),
  category: templateCategorySchema,
  name: z.string(),
  // One line, the hook. Shown on the card under the name.
  tagline: z.string(),
  // A paragraph: what the format is and why it works. Shown in the detail modal.
  description: z.string(),
  // A rendered example of this template's output. Null until we have actually
  // produced one — a card with a fake thumbnail is worse than a card with none,
  // so the gallery renders a typographic card when this is null rather than a
  // grey box pretending to be a video.
  previewUrl: z.string().nullable(),
  aspectRatio: aspectRatioSchema,
  // Total beats, including free title cards.
  shotCount: z.number().int().positive(),
  // Beats that cost credits. The multiplier behind every tier's price.
  clipCount: z.number().int().min(0),
  totalDurationSeconds: z.number().int().positive(),
  beats: z.array(templateBeatSchema),
  tiers: z.array(templateTierOfferSchema),
  variables: z.array(templateVariableSchema),
  // Whether the template ships spoken lines for its shots. Surfaced on the card
  // because it is the difference between a silent slideshow and the format as it
  // actually goes viral.
  hasVoiceover: z.boolean(),
  // Whether the template's last beat is authored to return to its opening frame,
  // so the clip cuts back to its own start seamlessly (ADR shorts-studio §10).
  // On the wire because the gallery filters on it: since 2025-03-31 every replay
  // counts as an additional view, and replay rate is one of the strongest
  // distribution signals a vertical platform has, so "does this loop?" is a real
  // reason to pick one card over another.
  //
  // It is a CLAIM THE PROMPTS HAVE TO BACK: a loopable template's final clip beat
  // must actually state the return to the opening composition, and a test in the
  // API asserts exactly that (templates.test.ts). A template that says true and
  // does not say so in its last prompt is lying to the gallery.
  loopable: z.boolean(),
  // How much AI-provenance labelling this template's output needs. See
  // disclosureTierSchema above for the three tiers and the rule for choosing
  // between them.
  disclosureTier: disclosureTierSchema,
  // The music bed the template recommends, as a prompt for the `music` model —
  // e.g. "melancholic soap-opera strings, dramatic, emotional piano". null = the
  // template has no opinion.
  //
  // This IS prompt text on the wire, unlike the shot prompts, and deliberately so:
  // the film editor's audio panel pre-fills its music field from it (looked up by
  // film.templateId), and "what music does a cheating-cat drama want?" is exactly
  // the question a user cannot answer and a template exists to answer for them.
  // It is one short line, not the eight paragraphs of staging direction that make
  // up the shots, so the reasons for keeping those server-side don't apply.
  musicPrompt: z.string().nullable(),
})
export type TemplateSummary = z.infer<typeof templateSummarySchema>

export const templateListSchema = z.object({ items: z.array(templateSummarySchema) })
export type TemplateList = z.infer<typeof templateListSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Instantiation. Creates the film and ALL its shots in one call, and charges
// NOTHING: every shot lands as a draft (generationId = null) with its prompt,
// preset, model, duration and spoken line already filled in. The user reviews,
// edits, and presses Generate per shot — which is where the credits go.
//
// Applying a template must never be a purchase. A one-click "spend 1120 credits"
// button is a trap, and it would also be a lie: the user has not seen the shots
// yet, and the first thing they will want to do is change one.
//
// `variables` is a plain map because its legal keys are the template's own
// declared variable keys — validated against the template server-side (unknown
// key → 400, select value outside the option set → 400). It cannot be typed more
// tightly here without a generic per template, which the wire cannot express.
// ─────────────────────────────────────────────────────────────────────────────
export const createFilmFromTemplateInputSchema = z.object({
  templateId: z.string().min(1),
  tier: templateTierSchema,
  variables: z.record(z.string(), z.string().max(600)).default({}),
  // Overrides the template's own generated title. Optional: the template composes
  // a title from the variables ("Клубника и баклажан") which is usually right.
  title: z.string().min(1).max(120).optional(),
})
export type CreateFilmFromTemplateInput = z.infer<typeof createFilmFromTemplateInputSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Batch instantiation — the Shorts Studio entry point (ADR: shorts-studio §2).
// The SAME template, applied once per ROW, in one request. It creates N films and
// N×M draft shots and charges, like its single-film sibling, NOTHING: the credits
// are spent afterwards, per beat, by the client-side runner and only behind the
// itemised confirm the ADR makes the load-bearing rule of the feature.
//
// A row supplies KNOB VALUES ONLY. Reusable inventory — cast entities, style
// packages, voices — is chosen once for the whole batch, not per row: forty clips
// need one brand and one face. Conflating durable inventory with per-run knobs is
// what makes a batch incoherent (ADR §5).
// ─────────────────────────────────────────────────────────────────────────────
export const createFilmsFromTemplateBatchRowSchema = z.object({
  // Same shape and the same server-side validation as the single-film route's
  // `variables`: unknown key → 400, select value outside the option set → 400.
  variables: z.record(z.string(), z.string().max(600)).default({}),
  // Overrides the title this row's template would compose from its own variables.
  title: z.string().min(1).max(120).optional(),
})
export type CreateFilmsFromTemplateBatchRow = z.infer<typeof createFilmsFromTemplateBatchRowSchema>

// TWENTY IS THE CAP, AND IT IS THE SUBMIT BUCKET'S NUMBER, NOT A ROUND ONE.
// POST /api/generations is rate-limited to 20/min because every submit spends
// provider money. A batch is instantiated free, but every beat it creates is a
// submit waiting to happen — so a batch larger than the bucket cannot be *run*
// faster than the bucket lets it: it queues behind the runner's concurrency cap
// and drips out at the limiter's pace. Capping the creation at the same 20 keeps
// the size of what the user can ask for and the size of what the system can
// actually deliver in a minute the same number, instead of letting the board show
// a hundred pending rows that the limiter will spend five minutes releasing.
//
// One is the floor because an empty batch is not a smaller batch — it is a
// request with no work in it, and answering 201 with zero films would tell the
// client something ran.
export const TEMPLATE_BATCH_MAX_ROWS = 20

export const createFilmsFromTemplateBatchInputSchema = z.object({
  templateId: z.string().min(1),
  // ONE tier for the whole batch: the tier is the price, and a batch is priced as
  // one number the user confirms once.
  tier: templateTierSchema,
  rows: z.array(createFilmsFromTemplateBatchRowSchema).min(1).max(TEMPLATE_BATCH_MAX_ROWS),
})
export type CreateFilmsFromTemplateBatchInput = z.infer<
  typeof createFilmsFromTemplateBatchInputSchema
>

// The response. `batchId` is minted by the SERVER — there is deliberately no
// field for it on the input — and stamped on every film in `films`, which is what
// makes the board reconstructible from GET /api/films?batchId=… after a reload.
//
// Full FilmDetails rather than ids for the same reason the single route returns
// one: the SPA seeds ['film', id] from each and draws the board immediately, with
// no N+1 fetch between "Создать" and a screen full of timelines.
export const createFilmsFromTemplateBatchResultSchema = z.object({
  batchId: z.string(),
  films: z.array(filmDetailSchema),
})
export type CreateFilmsFromTemplateBatchResult = z.infer<
  typeof createFilmsFromTemplateBatchResultSchema
>
