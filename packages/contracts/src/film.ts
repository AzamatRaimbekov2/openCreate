// packages/contracts/src/film.ts
// CinemaStudio wire contracts: Film, Shot, FilmAudio, FilmRender DTOs and their
// create/update inputs. The composition layer over generations.
//
// ADR: docs/wiki/decisions/cinema-studio.md
//
// Design notes that shape the schemas:
//  - A Shot points at a Generation (video|image) OR at nothing (a title card, or
//    an uploaded clip staged as a generation). generationId is therefore nullable.
//  - orderIndex is a real number so reorders never renumber the whole list; the
//    service spaces them out and midpoint-inserts. The client sends an ORDERED id
//    list to reorder — it never computes indices itself.
//  - Durations travel in milliseconds (the timeline unit); the render turns them
//    into ffmpeg seconds. A video shot plays [trimStartMs, trimStartMs+durationMs);
//    an image/title shot simply shows for durationMs.
//  - Dates travel as ISO strings — same reason as generation.ts (SQLite stores ms,
//    JSON has no Date).
import { z } from 'zod'
import { aspectRatioSchema } from './catalog'
import { entityRefSchema } from './entity'
import { createGenerationInputSchema } from './generation'
import { cameraMotionSchema, cameraShotSchema, promptPresetSchema, styleIdSchema } from './presets'

// The most references a single shot may carry — entity tags AND attached images
// together. It is the MAX over every reference-capable VIDEO model (today only
// Wan 2.7's r2v mode, at 5), NOT any one model's limit, because a shot's model
// can be unset when the reference is attached and can change before it is
// generated. The upload endpoint enforces this shared budget so the composer's
// "5/5" counter is truth; the per-generation gate then does the model-SPECIFIC
// final check (a model that accepts fewer refuses before charging). Kept in
// contracts so the composer renders the same ceiling the API enforces.
export const MAX_SHOT_REFERENCE_IMAGES = 5

// ─────────────────────────────────────────────────────────────────────────────
// Film — the top-level project. A title, a canvas aspect ratio every shot is
// scaled/padded to, and a default style the composer pre-selects for new shots.
// ─────────────────────────────────────────────────────────────────────────────
export const filmSchema = z.object({
  id: z.string(),
  title: z.string(),
  aspectRatio: aspectRatioSchema,
  // The style new shots default to; null = no default. Not enforced on shots
  // (a shot may pick its own), just a composer convenience.
  defaultStyleId: styleIdSchema.nullable(),
  // Provenance: the template this film was instantiated from (ADR: template-
  // catalog), or null for a hand-made film. Read-only from the client's side —
  // there is no way to set it via createFilm; only POST /films/from-template
  // stamps it. Two things read it back: the audio panel (to pre-fill the music
  // prompt the template authored, so the user doesn't have to invent "melancholic
  // soap-opera strings" themselves) and analytics ("which templates get finished?").
  templateId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Film = z.infer<typeof filmSchema>

// Note there is no templateId here on purpose: a film's template provenance is
// a fact the SERVER establishes, not a claim the client may assert.
export const createFilmInputSchema = z.object({
  title: z.string().min(1).max(120),
  aspectRatio: aspectRatioSchema,
  defaultStyleId: styleIdSchema.nullable().optional(),
})
export type CreateFilmInput = z.infer<typeof createFilmInputSchema>

export const updateFilmInputSchema = z
  .object({
    title: z.string().min(1).max(120),
    aspectRatio: aspectRatioSchema,
    defaultStyleId: styleIdSchema.nullable(),
  })
  .partial()
export type UpdateFilmInput = z.infer<typeof updateFilmInputSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Shot — one clip on the timeline. A crossfade INTO this shot from the previous
// one, an optional text overlay, and the trim window into its source media.
// ─────────────────────────────────────────────────────────────────────────────
export const transitionSchema = z.enum(['none', 'crossfade'])
export type Transition = z.infer<typeof transitionSchema>

export const titlePositionSchema = z.enum(['top', 'center', 'bottom'])
export type TitlePosition = z.infer<typeof titlePositionSchema>

export const shotTitleSchema = z.object({
  text: z.string().min(1).max(200),
  position: titlePositionSchema,
})
export type ShotTitle = z.infer<typeof shotTitleSchema>

// The line this shot's character SPEAKS, and the catalog voice that speaks it.
// Authored copy — not a generated asset: holding it costs nothing, and it is the
// script the user edits before spending 8 credits to hear it.
//
// Why a shot owns a voice line at all (ADR: template-catalog §4). The formats the
// template catalog ships — fruit dramas, cat soap operas, talking produce — ARE
// dialogue. Without a voice they are a silent slideshow, which is not the format.
// But FilmAudio requires a generationId, so a track cannot exist as a draft: a
// template had no way to hand the user "here is what the strawberry says in beat
// 4" without generating (and charging for) the TTS up front. This field is that
// draft slot. Generating it produces an audio generation and files it as a
// FilmAudio track whose startMs is the sum of the preceding shots' durations —
// so the line lands under the beat that speaks it.
//
// It is NOT a lipsync contract. No model in the catalog does lipsync; the mouth
// movement is whatever the video model hallucinates from the prompt, and the
// voice is mixed under it by ffmpeg at render. (veo-3-1-fast can speak natively
// from the prompt itself, which is why the premium tier exists.)
export const shotVoiceoverSchema = z.object({
  text: z.string().min(1).max(600),
  // A voice id from the audio model's `voices` list ('Svetlana', 'Dmitry', …).
  // Not enum'd: the list is catalog data that changes with the provider, so the
  // API validates it against the live catalog rather than freezing it on the wire.
  voice: z.string().min(1).max(80),
})
export type ShotVoiceover = z.infer<typeof shotVoiceoverSchema>

// One attached reference image on a shot. This is the READ shape: a stable
// server media path ('/media/<uuid>.<ext>') and the id used to delete it — NEVER
// the raw bytes. The bytes were uploaded once (addShotReferenceInputSchema) and
// now live in our storage; handing them back inline would bloat every film-detail
// payload and re-open a data-URI channel the wire deliberately does not carry.
// The path is server-sourced back into a data URI only at generation time
// (readAsDataUri), inside the closed referenceImages seam.
export const shotReferenceImageSchema = z.object({
  id: z.string(),
  path: z.string(),
})
export type ShotReferenceImage = z.infer<typeof shotReferenceImageSchema>

export const shotSchema = z.object({
  id: z.string(),
  filmId: z.string(),
  // Real-valued sort key; the client never sets it (reorder sends an id list).
  orderIndex: z.number(),
  // The generation whose media this shot plays. null = a title card with no
  // footage (a solid background + the title overlay), rendered for durationMs.
  generationId: z.string().nullable(),
  // The user's text for THIS shot — kept so "Regenerate" and storyboard drafts
  // read back the words the user wrote, never the composed fragment soup.
  prompt: z.string(),
  // The structured preset this shot was (or will be) generated with.
  promptPreset: promptPresetSchema.nullable(),
  // The characters tagged in THIS shot's prompt — the `[[e1]]` tokens and which
  // entity each one is. This is what makes a FILM instead of a pile of clips: tag
  // a character here and shot 2 shows the same one as shot 1, because the server
  // attaches her photo as a reference (Wan 2.7's r2v mode) and substitutes her
  // name into the text.
  //
  // It lives on the SHOT, not on the film, because a cast is per-beat: the fox is
  // in shots 1–3, the bear enters in shot 4. A film-level cast would either send
  // every character into every shot (paying to condition on people who are not in
  // frame) or need a second per-shot filter anyway.
  //
  // Empty array = nobody tagged, which is the honest default and reads identically
  // to the old shape for every film that predates this.
  entityRefs: z.array(entityRefSchema),
  // Arbitrary images attached DIRECTLY to this shot as generation references —
  // not tagged Entities, just "make it look like these". Same discipline as
  // entityRefs: an ARRAY, never null on the wire (a shot that predates this
  // column simply has an empty one), so a client never null-checks before it
  // maps. This is what makes an attached reference PERSIST: it is stored on the
  // shot, so a re-generate re-sends it (the server re-reads it into the closed
  // referenceImages seam every time), whereas a one-off upload on the generation
  // request would vanish the moment the clip was remade.
  referenceImages: z.array(shotReferenceImageSchema),
  // The catalog model this shot generates with. null = "no opinion", and the
  // composer falls back to the shot's style recommendation, then to the first
  // video model.
  //
  // This used to not exist, and the model was transient state inside the shot
  // inspector: it defaulted to videoModels[0] on every mount, so re-selecting a
  // shot silently forgot which model produced its clip and a re-Generate could
  // come back on a different model at a different price. Persisting it fixes that
  // AND is what lets a template pin a tier: "this eight-beat drama runs on
  // veo-3-1-fast" is a per-shot fact, and there was nowhere to write it down.
  modelId: z.string().nullable(),
  // How long this shot occupies the timeline, in ms. For a video source this is
  // the trimmed length; for image/title it is the display duration.
  durationMs: z.number().int().positive(),
  // Video trim in-point, in ms from the start of the source clip.
  trimStartMs: z.number().int().min(0),
  transition: transitionSchema,
  transitionMs: z.number().int().min(0),
  title: shotTitleSchema.nullable(),
  voiceover: shotVoiceoverSchema.nullable(),
  // Native generation audio for THIS shot: generate the clip with the model's
  // own soundtrack (where the model offers one — see catalog `nativeAudio`) and
  // carry that track into the film's export mix. false = the pre-feature
  // behaviour: silent clip, render mixes only music/voiceover tracks.
  audio: z.boolean(),
  createdAt: z.string(),
})
export type Shot = z.infer<typeof shotSchema>

// Every field but nothing required has a sensible service default — a shot can
// be created empty (a placeholder to fill later) or fully specified from a
// storyboard draft. generationId/prompt/promptPreset default to null/''/null.
export const createShotInputSchema = z.object({
  generationId: z.string().nullable().optional(),
  prompt: z.string().max(2000).optional(),
  promptPreset: promptPresetSchema.nullable().optional(),
  // The cast of this shot. Capped at MAX_SHOT_REFERENCE_IMAGES — Wan 2.7 r2v's own
  // limit, and the only model that can honour references at all today. A longer
  // list would be accepted here and then rejected at generate time, after the user
  // had already arranged the shot; refusing it at the door is the kinder failure.
  entityRefs: z.array(entityRefSchema).max(MAX_SHOT_REFERENCE_IMAGES).optional(),
  // Validated against the live catalog by the service (must be a video model),
  // not by an enum here — model ids are catalog data, not wire constants.
  modelId: z.string().max(80).nullable().optional(),
  durationMs: z.number().int().positive().max(60_000).optional(),
  trimStartMs: z.number().int().min(0).optional(),
  transition: transitionSchema.optional(),
  transitionMs: z.number().int().min(0).max(5000).optional(),
  title: shotTitleSchema.nullable().optional(),
  voiceover: shotVoiceoverSchema.nullable().optional(),
  // See shotSchema.audio. Optional on the way in; the service defaults it false.
  audio: z.boolean().optional(),
})
export type CreateShotInput = z.infer<typeof createShotInputSchema>

export const updateShotInputSchema = createShotInputSchema
export type UpdateShotInput = z.infer<typeof updateShotInputSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Attaching a reference image to a shot (POST /api/films/:id/shots/:shotId/references).
//
// The client hands over BYTES as a data URI — the same discipline as
// entity.ts's image upload and generation.inputImage: the API never fetches an
// arbitrary user URL (SSRF guard), and the 14MB cap tracks the ~10MB file limit
// after base64 inflation. Validated HERE, at the boundary, not only in the route:
//  · `data:image/` — a raster image, never a URL and never text.
//  · NOT svg — `image/svg+xml` is an "image" that carries <script>; served from
//    our own origin it becomes stored XSS. The storage layer (parseImageDataUri)
//    rejects it again on the disk side, but the boundary rejects it first so a
//    bad upload is a clean 400, not a 500 surfaced deep in the service.
//  · size-capped on the base64 string; the storage layer re-checks the DECODED
//    byte count (base64 inflates ~4/3), so the real ceiling is measured, not
//    guessed.
export const addShotReferenceInputSchema = z.object({
  dataUri: z
    .string()
    .startsWith('data:image/')
    .max(14_000_000)
    // svg is an image mime that carries script — reject it before it can be stored
    // and served from our origin. Case-insensitive: `data:IMAGE/SVG+XML` is svg too.
    .refine((v) => !/^data:image\/svg/i.test(v), 'svg images are not allowed'),
})
export type AddShotReferenceInput = z.infer<typeof addShotReferenceInputSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Generating a shot's clip (POST /api/films/:id/shots/:shotId/clip).
//
// This is the server seam that keeps the reference-image data-URI channel CLOSED.
// The wire `createGenerationInputSchema` deliberately has no `referenceImages`
// field, so a client body can never inject reference-image bytes into a
// generation. The shot's ATTACHED images are read server-side (from storage) and
// folded into the closed channel only inside this route — the client sends the
// same body it would send to POST /api/generations, and the server sources the
// bytes it never lets the client provide.
//
// Two deltas from the plain generation input:
//  · entityRefs is widened to MAX_SHOT_REFERENCE_IMAGES. The wire /generations
//    schema caps entityRefs at 1 (the ChatComposer's single-subject case), but a
//    shot's cast is up to 5 (Wan 2.7 r2v); a multi-character shot could not be
//    generated through the 1-cap wire schema at all. The per-generation gate
//    still enforces the chosen model's real limit before charging.
//  · a stray `referenceImages` key is STRIPPED (zod objects drop unknown keys),
//    so even a hand-rolled body cannot open the channel.
export const generateShotClipInputSchema = createGenerationInputSchema.extend({
  entityRefs: z.array(entityRefSchema).max(MAX_SHOT_REFERENCE_IMAGES).optional(),
})
export type GenerateShotClipInput = z.infer<typeof generateShotClipInputSchema>

// Reorder = the full ordered list of this film's shot ids. The service reassigns
// evenly-spaced orderIndex values; the client never touches orderIndex directly.
export const reorderShotsInputSchema = z.object({
  shotIds: z.array(z.string().min(1)).min(1),
})
export type ReorderShotsInput = z.infer<typeof reorderShotsInputSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Split a shot at a point (POST /api/films/:id/shots/:shotId/split).
//
// `atMs` is the split offset measured from the shot's OWN start: the target shot
// is truncated to atMs, and a new shot is inserted directly after it citing the
// same generation with its trim window shifted by atMs and the remaining duration.
// The NLE's split-at-playhead — composable client-side (shorten A, add B, reorder)
// but a 3-call non-atomic sequence, so it gets one atomic endpoint instead.
//
// The wire only enforces the LOWER bound (a positive integer millisecond). The
// UPPER bound — atMs must fall strictly INSIDE the shot (atMs < durationMs) — is a
// domain rule the service checks, because the schema has no access to the shot it
// is splitting. Both a non-positive atMs (rejected here) and an out-of-range one
// (rejected there) are a 400 validation_failed.
export const splitShotInputSchema = z.object({
  atMs: z.number().int().positive(),
})
export type SplitShotInput = z.infer<typeof splitShotInputSchema>

// ─────────────────────────────────────────────────────────────────────────────
// FilmAudio — a music bed or a voiceover track laid under the timeline. Each
// points at an audio generation (generation.type = 'audio').
// ─────────────────────────────────────────────────────────────────────────────
export const audioKindSchema = z.enum(['music', 'voiceover'])
export type AudioKind = z.infer<typeof audioKindSchema>

export const filmAudioSchema = z.object({
  id: z.string(),
  filmId: z.string(),
  kind: audioKindSchema,
  generationId: z.string(),
  // The shot this track voices, or null for a film-wide bed (music, or a
  // voiceover the user placed by hand).
  //
  // It exists to make "voice this shot" SAFE. Without it the editor cannot tell
  // whether a shot has already been voiced, so a second click on Generate would
  // quietly add a second overlapping track — and charge for it again. With it the
  // action is a replace, not an append: the old track is dropped before the new
  // one lands, and the button can honestly read "Re-voice" instead of "Voice".
  // It also lets the track list say WHICH beat a line belongs to.
  shotId: z.string().nullable(),
  // Where the track starts on the timeline, in ms.
  startMs: z.number().int().min(0),
  // Level trim in decibels; 0 = unchanged.
  gainDb: z.number(),
})
export type FilmAudio = z.infer<typeof filmAudioSchema>

export const addFilmAudioInputSchema = z.object({
  kind: audioKindSchema,
  generationId: z.string().min(1),
  shotId: z.string().nullable().optional(),
  startMs: z.number().int().min(0).optional(),
  gainDb: z.number().min(-40).max(20).optional(),
})
export type AddFilmAudioInput = z.infer<typeof addFilmAudioInputSchema>

// ─────────────────────────────────────────────────────────────────────────────
// FilmRender — an ffmpeg export job. Same status machine SHAPE as a generation
// (processing → succeeded/failed, poll-driven, stale-reaped) but no ledger:
// it spends our CPU, not a provider invoice, so there is no cost and no refund.
// ─────────────────────────────────────────────────────────────────────────────
export const renderStatusSchema = z.enum(['processing', 'succeeded', 'failed'])
export type RenderStatus = z.infer<typeof renderStatusSchema>

export const filmRenderSchema = z.object({
  id: z.string(),
  filmId: z.string(),
  status: renderStatusSchema,
  progress: z.number().int().min(0).max(100).nullable(),
  // Served /media/<id>.mp4 path once succeeded; null while processing/failed.
  mediaUrl: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
})
export type FilmRender = z.infer<typeof filmRenderSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Why an export was REFUSED before ffmpeg ever ran.
//
// A refusal is not a failed render: nothing was encoded, so "the render didn't
// finish, try again" describes something that never began and points the user at
// a button that cannot help. What helps is the CAUSE — and the causes demand
// three different actions: WAIT (it is still generating), REGENERATE (it failed
// or its media is gone), or REMOVE (it can never work). One code per cause is
// what lets the client say which.
//
// This lives in film.ts, not errors.ts, on purpose: `apiErrorCodeSchema` is the
// app-wide HTTP taxonomy, and widening it with Cinema domain detail would force
// every app's exhaustive code→copy map to carry a render string.
//
// Two throw sites produce three reasons each — a still-processing subject and a
// failed one used to share a single `status !== 'succeeded'` branch, and telling
// a user to "wait" when the thing already failed is the exact bug this splits.
export const renderBlockReasonSchema = z.enum([
  // ── Shot side ──
  // The cited generation row is gone (deleted from the library).
  'shot_clip_missing',
  // Still generating upstream — self-resolving, so: wait.
  'shot_clip_processing',
  // The generation failed — never self-resolves, so: regenerate.
  'shot_clip_failed',
  // An audio generation is cited as a shot's footage; the mux cannot use it.
  'shot_clip_is_audio',
  // Succeeded, but the file is not on disk (pruned, expired, lost save).
  'shot_media_missing',
  // ── Film side ──
  // Nothing renderable at all: no clip and no title card.
  'film_no_shots',
  // ── Audio side (mirrors the shot side, same three timing cases) ──
  'audio_generation_missing',
  'audio_processing',
  'audio_failed',
  'audio_media_missing',
])
export type RenderBlockReason = z.infer<typeof renderBlockReasonSchema>

// What the reason is ABOUT, so the client can name it ("Shot 4", "Music") and
// jump to it. Without this a perfectly localized sentence still leaves the user
// hunting through a twelve-shot timeline.
export const renderBlockSubjectSchema = z.enum(['shot', 'audio', 'film'])
export type RenderBlockSubject = z.infer<typeof renderBlockSubjectSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Composite read shapes — the editor loads a film with its ordered shots and
// audio in one call; a list view needs only the films.
// ─────────────────────────────────────────────────────────────────────────────
export const filmDetailSchema = z.object({
  film: filmSchema,
  shots: z.array(shotSchema),
  audio: z.array(filmAudioSchema),
  // The film's most recent export, or null if it has never been exported.
  //
  // It rides the DETAIL — not a separate list route — because it exists to
  // answer exactly one question the editor asks on every mount: "what happened
  // to my export?". Before this field the answer lived only in React state, so
  // a reload lost a running render entirely: the status strip vanished, Export
  // was offered again (starting a SECOND ffmpeg job on the same film), and a
  // finished mp4 became unreachable from the UI even though the file was sitting
  // on disk. A render outlives the tab that started it, so its handle has to
  // come back with the film.
  //
  // Nullable rather than optional: "never exported" is a real, first-class state
  // the UI renders differently from "not loaded yet".
  latestRender: filmRenderSchema.nullable(),
})
export type FilmDetail = z.infer<typeof filmDetailSchema>

export const filmListSchema = z.object({ items: z.array(filmSchema) })
export type FilmList = z.infer<typeof filmListSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Storyboard — an LLM breaks a script into draft shots (ADR §"Script → story-
// board"). The response becomes draft shots (generationId = null); nothing is
// generated or charged until the user reviews and presses Generate per shot.
// ─────────────────────────────────────────────────────────────────────────────
export const createStoryboardInputSchema = z.object({
  script: z.string().min(10).max(8000),
  // The style all draft shots inherit (folded into each shot's promptPreset).
  styleId: styleIdSchema.optional(),
  // Target number of shots; the model may return fewer if the script is short.
  shotCount: z.number().int().min(1).max(20).optional(),
})
export type CreateStoryboardInput = z.infer<typeof createStoryboardInputSchema>

// One shot the storyboard model proposes. Validated on the way OUT of the LLM so
// a malformed completion is rejected rather than written as a broken shot.
export const storyboardShotSchema = z.object({
  title: z.string().max(200),
  prompt: z.string().min(1).max(2000),
  cameraShot: cameraShotSchema.optional(),
  cameraMotion: cameraMotionSchema.optional(),
  durationSeconds: z.number().int().min(1).max(15).optional(),
})
export type StoryboardShot = z.infer<typeof storyboardShotSchema>
export const storyboardResponseSchema = z.object({ shots: z.array(storyboardShotSchema).min(1).max(20) })
