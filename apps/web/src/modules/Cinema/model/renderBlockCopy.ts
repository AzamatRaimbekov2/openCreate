// apps/web/src/modules/Cinema/model/renderBlockCopy.ts
// Turn an export REFUSAL into a sentence a user can act on.
//
// THE PROBLEM THIS SOLVES. `buildPlan` can refuse an export ten different ways,
// and every one of them used to arrive as `validation_failed` with one string:
// "the export can't start yet — something on the timeline isn't ready". That
// sentence is true and useless. The only three things a user can actually do are
// WAIT (it is still generating), REGENERATE (it failed, or its media is gone) and
// REMOVE (it can never work) — and a single sentence cannot tell them which.
//
// So the server now sends a `reason` and the SUBJECT it is about, and this maps
// that pair to copy that names the thing and gives exactly one instruction.
//
// NAMING MATTERS AS MUCH AS THE REASON. "A shot's clip is still generating" on a
// twelve-shot film still leaves the user hunting. The subject id is resolved here
// against the film the editor already holds, so the message says "Shot 4" — the
// same number the tile shows — or "Music" / "Line · beat 3", the names already on
// the audio lane.
import type { FilmAudio, RenderBlockReason, Shot } from '@opencreate/contracts'
import { renderBlockReasonSchema } from '@opencreate/contracts'
import type { ApiErrorDetail } from 'shared/libs/apiClient'

// i18next's `t`, narrowed to what this file needs. The vars object is REQUIRED
// rather than optional: under `exactOptionalPropertyTypes` an optional parameter
// admits `undefined`, which i18next's own overloads do not accept, so a
// `vars?:` signature is not assignable to the real `t`. Callers pass `{}` when
// there is nothing to interpolate.
type Translate = (key: string, vars: Record<string, string>) => string

export type RenderBlock = {
  // Localized, subject-naming, one action. Never server prose.
  message: string
  subjectKind: 'shot' | 'audio' | 'film' | undefined
  subjectId: string | undefined
}

// Exhaustive by construction: this is a Record over the closed reason enum, so
// adding a member in contracts without copy here is a TYPECHECK error, not a
// silent fall-through to the generic string. Same mechanism shared/libs/errorCopy
// uses for the app-wide error codes, and the reason that map has never drifted.
const REASON_KEYS: Record<RenderBlockReason, string> = {
  shot_clip_missing: 'cinema.render.blockedReason.shot_clip_missing',
  shot_clip_processing: 'cinema.render.blockedReason.shot_clip_processing',
  shot_clip_failed: 'cinema.render.blockedReason.shot_clip_failed',
  shot_clip_is_audio: 'cinema.render.blockedReason.shot_clip_is_audio',
  shot_media_missing: 'cinema.render.blockedReason.shot_media_missing',
  film_no_shots: 'cinema.render.blockedReason.film_no_shots',
  audio_generation_missing: 'cinema.render.blockedReason.audio_generation_missing',
  audio_processing: 'cinema.render.blockedReason.audio_processing',
  audio_failed: 'cinema.render.blockedReason.audio_failed',
  audio_media_missing: 'cinema.render.blockedReason.audio_media_missing',
}

// A shot's HUMAN name is its position, because that is what the timeline shows —
// tiles are numbered, not titled. Falls back to the raw ordinal if the shot is no
// longer in the film (it was deleted between the refusal and this render).
function shotLabel(shots: Shot[], subjectId: string | undefined): string {
  const index = shots.findIndex((shot) => shot.id === subjectId)
  return index >= 0 ? String(index + 1) : '—'
}

// An audio track's name, matching the chip on the lane exactly: a shot-attached
// line is named by the beat it voices, everything else by its kind.
function audioLabel(audio: FilmAudio[], shots: Shot[], subjectId: string | undefined, t: Translate): string {
  const track = audio.find((item) => item.id === subjectId)
  if (!track) return '—'
  const beat = track.shotId ? shots.findIndex((shot) => shot.id === track.shotId) : -1
  return beat >= 0
    ? t('cinema.audio.shotLine', { beat: String(beat + 1) })
    : t(`cinema.audio.kind.${track.kind}`, {})
}

// Resolve a refusal into copy. Returns null when the failure carries no reason we
// recognize — the caller then keeps today's generic sentence, which is what makes
// an older server (or a future reason this build has not heard of) degrade calmly
// instead of rendering an empty string or throwing.
export function renderBlockCopy(
  detail: ApiErrorDetail,
  shots: Shot[],
  audio: FilmAudio[],
  t: Translate,
): RenderBlock | null {
  // safeParse, not a cast: `reason` crosses the network as a plain string and this
  // build's enum is the only authority on what it may be.
  const parsed = renderBlockReasonSchema.safeParse(detail.reason)
  if (!parsed.success) return null

  const subject =
    detail.subjectKind === 'shot'
      ? shotLabel(shots, detail.subjectId)
      : detail.subjectKind === 'audio'
        ? audioLabel(audio, shots, detail.subjectId, t)
        : ''

  return {
    message: t(REASON_KEYS[parsed.data], { subject }),
    subjectKind: detail.subjectKind,
    subjectId: detail.subjectId,
  }
}
