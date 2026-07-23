// apps/web/src/modules/Cinema/model/computeExportBlock.ts
// CLIENT-side export validation (client-side-export ADR). The retired server render
// refused to build a film whose clips weren't ready and returned a subject-naming
// `renderBlockReason`; the client export must refuse the SAME cases (or it would
// happily "export" a film with a still-generating or failed clip). This computes
// the first blocking reason from the shots + the generation cache and reuses
// `renderBlockCopy` for the exact localized, subject-naming sentence — so a shot
// says "Shot 4 · wait", an audio track "Music · remove", identical to before.
import type { FilmAudio, Generation, RenderBlockReason, Shot } from '@opencreate/contracts'
import type { ApiErrorDetail } from 'shared/libs/apiClient'
import { renderBlockCopy, type RenderBlock } from './renderBlockCopy'

type Translate = (key: string, vars: Record<string, string>) => string

// A shot renders if it has a clip OR a title (a title card is a black slate + text).
function isRenderable(shot: Shot): boolean {
  return shot.generationId !== null || shot.title !== null
}

// The reason a single generation blocks the export, or null when it is ready. An
// UNRESOLVED generation (not in the cache yet) is treated as still generating —
// the honest "wait" answer while the poll catches up, not a false "missing".
function clipReason(generation: Generation | undefined, isAudioTrack: boolean): RenderBlockReason | null {
  if (generation === undefined) return isAudioTrack ? 'audio_processing' : 'shot_clip_processing'
  if (generation.status === 'processing') return isAudioTrack ? 'audio_processing' : 'shot_clip_processing'
  if (generation.status === 'failed') return isAudioTrack ? 'audio_failed' : 'shot_clip_failed'
  if (generation.status !== 'succeeded') return isAudioTrack ? 'audio_processing' : 'shot_clip_processing'
  // Succeeded: a video shot must cite a visual clip, and either must carry media.
  if (!isAudioTrack && generation.type === 'audio') return 'shot_clip_is_audio'
  if (generation.mediaUrls[0] === undefined) return isAudioTrack ? 'audio_media_missing' : 'shot_media_missing'
  return null
}

// Build a `renderBlockReason`-shaped detail and resolve it through `renderBlockCopy`
// (the same code the server refusal used), so the copy path never forks.
function toBlock(
  reason: RenderBlockReason,
  subjectKind: 'shot' | 'audio' | 'film',
  subjectId: string | undefined,
  shots: Shot[],
  audio: FilmAudio[],
  t: Translate,
): RenderBlock | null {
  const detail: ApiErrorDetail = { reason, subjectKind, ...(subjectId !== undefined ? { subjectId } : {}) }
  return renderBlockCopy(detail, shots, audio, t)
}

export function computeExportBlock(
  shots: Shot[],
  audio: FilmAudio[],
  generationsById: Record<string, Generation>,
  t: Translate,
): RenderBlock | null {
  // Nothing to render at all.
  if (!shots.some(isRenderable)) {
    return toBlock('film_no_shots', 'film', undefined, shots, audio, t)
  }
  // Each footage shot's clip, in order (the first blocker is the one to name).
  for (const shot of shots) {
    if (shot.generationId === null) continue // a title/empty shot renders a slate
    const reason = clipReason(generationsById[shot.generationId], false)
    if (reason !== null) return toBlock(reason, 'shot', shot.id, shots, audio, t)
  }
  // Then the audio tracks — a failed/unready track blocks the mix, as on the server.
  for (const track of audio) {
    const reason = clipReason(generationsById[track.generationId], true)
    if (reason !== null) return toBlock(reason, 'audio', track.id, shots, audio, t)
  }
  return null
}
