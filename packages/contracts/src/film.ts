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
import { cameraMotionSchema, cameraShotSchema, promptPresetSchema, styleIdSchema } from './presets'

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
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Film = z.infer<typeof filmSchema>

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
  // How long this shot occupies the timeline, in ms. For a video source this is
  // the trimmed length; for image/title it is the display duration.
  durationMs: z.number().int().positive(),
  // Video trim in-point, in ms from the start of the source clip.
  trimStartMs: z.number().int().min(0),
  transition: transitionSchema,
  transitionMs: z.number().int().min(0),
  title: shotTitleSchema.nullable(),
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
  durationMs: z.number().int().positive().max(60_000).optional(),
  trimStartMs: z.number().int().min(0).optional(),
  transition: transitionSchema.optional(),
  transitionMs: z.number().int().min(0).max(5000).optional(),
  title: shotTitleSchema.nullable().optional(),
})
export type CreateShotInput = z.infer<typeof createShotInputSchema>

export const updateShotInputSchema = createShotInputSchema
export type UpdateShotInput = z.infer<typeof updateShotInputSchema>

// Reorder = the full ordered list of this film's shot ids. The service reassigns
// evenly-spaced orderIndex values; the client never touches orderIndex directly.
export const reorderShotsInputSchema = z.object({
  shotIds: z.array(z.string().min(1)).min(1),
})
export type ReorderShotsInput = z.infer<typeof reorderShotsInputSchema>

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
  // Where the track starts on the timeline, in ms.
  startMs: z.number().int().min(0),
  // Level trim in decibels; 0 = unchanged.
  gainDb: z.number(),
})
export type FilmAudio = z.infer<typeof filmAudioSchema>

export const addFilmAudioInputSchema = z.object({
  kind: audioKindSchema,
  generationId: z.string().min(1),
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
// Composite read shapes — the editor loads a film with its ordered shots and
// audio in one call; a list view needs only the films.
// ─────────────────────────────────────────────────────────────────────────────
export const filmDetailSchema = z.object({
  film: filmSchema,
  shots: z.array(shotSchema),
  audio: z.array(filmAudioSchema),
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
