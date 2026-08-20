// apps/web/src/modules/Shorts/model/boardStatus.ts
// What a beat's chip says, DERIVED — never stored.
//
// ADR shorts-studio §2 is the whole of this file: "there is no batch table, no
// job rows, no status machine, no worker. Batch progress is derived, exactly as
// Assets3D derives part status: each shot cites a generation_id, and that
// generation's live status is the truth."
//
// So there are two inputs and a strict precedence between them:
//
//   1. THE SHARED ['generation', id] CACHE — the truth about a clip that exists.
//      Every poller in the app (the timeline's ShotThumb, this board, the run
//      loop) writes the same entry, so N subscribers to one clip cost one poll.
//   2. THE RUN STORE — and ONLY for the three things the cache cannot know:
//      a beat still waiting behind the concurrency cap ('queued'), a POST in
//      flight ('submitting'), and a submit that failed BEFORE any generation row
//      was created. That last one is the important one: `insufficient_credits`
//      halfway through a forty-clip batch leaves nothing to poll, and a beat that
//      goes quiet without saying why is indistinguishable from one that finished.
//
// The cache OVERRULES the store, always. The store outlives the run (it is a
// module store, not component state), so after a remount it may still describe a
// beat as queued whose clip has long since landed. A board that contradicts the
// media it is displaying is worse than one that forgets.
import type { Generation, Shot } from '@opencreate/contracts'

// One beat of the run, as the runner tracks it. The type lives HERE rather than
// beside the store so the pure derivation does not import a zustand file — the
// dependency runs runner → model, never the other way.
export type BatchRunItemStatus = 'queued' | 'submitting' | 'processing' | 'done' | 'failed'

export type BatchRunItem = {
  filmId: string
  shotId: string
  status: BatchRunItemStatus
  // Set the moment POST /api/generations answers — one request BEFORE
  // shot.generationId catches up. See beatGenerationId.
  generationId: string | null
  // Only ever a SUBMIT failure. A generation that settled `failed` carries its
  // own code in the cache and is read from there.
  errorCode: string | null
}

// What the board renders. 'free' is a title card: no model, no prompt, no cost,
// nothing to run — it is drawn as text over black by the exporter.
export type BeatStatus =
  | 'free'
  | 'draft'
  | 'queued'
  | 'submitting'
  | 'processing'
  | 'succeeded'
  | 'failed'

export type BeatState = {
  status: BeatStatus
  // Machine code, never prose — the chip maps it through errorCodeMessageKey
  errorCode: string | null
}

// Does this shot cost credits? A template's title cards land with modelId null
// and an empty prompt (see the API's instantiate), which is a far more robust
// test than "index i of template.beats said generated" — it survives a user
// editing the film in Cinema before running the batch.
export function isGeneratedBeat(shot: Pick<Shot, 'modelId' | 'prompt'>): boolean {
  return shot.modelId !== null && shot.prompt.trim().length > 0
}

// The generation this beat is about, if any. The shot's own citation wins — it
// is the persisted fact — but between POST /api/generations answering and
// PATCH /shots/:id landing, the run item is the only thing that knows a clip
// exists. Without the fallback the beat blinks back to "draft" mid-run, offering
// a Generate button for a clip that has already been charged for.
export function beatGenerationId(
  shot: Pick<Shot, 'generationId'>,
  runItem: BatchRunItem | undefined,
): string | null {
  return shot.generationId ?? runItem?.generationId ?? null
}

export function beatState(
  shot: Pick<Shot, 'generationId' | 'modelId' | 'prompt'>,
  runItem: BatchRunItem | undefined,
  generation: Pick<Generation, 'status' | 'errorCode'> | undefined,
): BeatState {
  if (!isGeneratedBeat(shot)) return { status: 'free', errorCode: null }

  const generationId = beatGenerationId(shot, runItem)
  if (generationId !== null) {
    // A clip exists. The cache decides, and an entry that has not arrived yet
    // means "we are finding out", not "nothing here" — never offer to pay again.
    if (generation?.status === 'succeeded') return { status: 'succeeded', errorCode: null }
    if (generation?.status === 'failed') {
      return { status: 'failed', errorCode: generation.errorCode ?? 'provider_error' }
    }
    return { status: 'processing', errorCode: null }
  }

  // No clip. Only the run store has anything left to say.
  if (runItem?.status === 'failed') {
    return { status: 'failed', errorCode: runItem.errorCode ?? 'internal_error' }
  }
  if (runItem?.status === 'submitting') return { status: 'submitting', errorCode: null }
  if (runItem?.status === 'queued') return { status: 'queued', errorCode: null }
  return { status: 'draft', errorCode: null }
}

export type BatchProgress = {
  // Beats that can cost credits — free title cards are not progress
  total: number
  succeeded: number
  failed: number
  // Still queued, submitting, processing, or never started
  pending: number
  // Every payable beat has reached a terminal state AND at least one exists.
  // A batch nobody has started is not "settled", it is "not begun".
  isSettled: boolean
}

export function batchProgress(states: readonly BeatState[]): BatchProgress {
  const payable = states.filter((state) => state.status !== 'free')
  const succeeded = payable.filter((state) => state.status === 'succeeded').length
  const failed = payable.filter((state) => state.status === 'failed').length
  const pending = payable.length - succeeded - failed
  return {
    total: payable.length,
    succeeded,
    failed,
    pending,
    isSettled: payable.length > 0 && pending === 0,
  }
}
