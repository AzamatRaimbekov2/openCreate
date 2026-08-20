// Runware behind the ImageProvider seam. This is the code that used to sit
// INLINE in the generation service — moved, not rewritten, so the behaviour every
// existing image test pins is byte-for-byte what it was: one synchronous
// imageInference call, settled inside the same request.
//
// It answers `{ kind: 'done' }`, which is the whole point of that union: Runware
// keeps its synchronous shape instead of being taught to mint job ids it would
// then have to remember across a deploy.
//
// Its OTHER job now is being the failover link. When kie.ai refuses a job at
// submit — out of credits, over the prompt limit, or handed a reference with no
// public URL (local dev) — this is what runs instead, from the same catalogue
// entry's AIR. Which is why it still takes data URIs for references: they work
// exactly where kie's URLs do not.
import { randomUUID } from 'node:crypto'
import type {
  ImageProvider,
  ImagePollResult,
  ImageSubmitInput,
  ImageSubmitResult,
} from '../image-provider'
import type { RunwareClient } from './client'

export function createRunwareImageAdapter(runware: RunwareClient): ImageProvider {
  const submit = async (input: ImageSubmitInput): Promise<ImageSubmitResult> => {
    const model = input.models.runware
    // Unreachable through the catalogue (every image entry carries an AIR), but
    // the seam allows it, and a missing handle must read as "this backend cannot
    // run this model" rather than as a request to Runware for the id 'undefined'.
    if (!model) throw new Error('no runware model handle for this generation')

    const res = await runware.imageInference({
      // Minted here rather than threaded in from the service: the image path is
      // synchronous, so this id is never persisted and never polled with — it is
      // Runware's per-task handle for the duration of one HTTP call. (The VIDEO
      // path is the one where the service's own taskUUID doubles as an
      // idempotency key, and that path is untouched.)
      taskUUID: randomUUID(),
      positivePrompt: input.prompt,
      // Absent → not sent. The catalogue's `supportsNegativePrompt` is what
      // decides whether one was composed at all: Runware does not ignore a
      // parameter a model cannot take, it rejects the whole task.
      ...(input.negativePrompt ? { negativePrompt: input.negativePrompt } : {}),
      model,
      // Data URIs, never URLs: our /media paths are not publicly reachable in
      // dev, so a URL would fail exactly where we test it.
      ...(input.referenceImages && input.referenceImages.length > 0
        ? { referenceImages: input.referenceImages.map((r) => r.dataUri) }
        : {}),
      ...(input.seed !== undefined ? { seed: input.seed } : {}),
      width: input.width,
      height: input.height,
    })

    return {
      kind: 'done',
      assetUrl: res.imageURL,
      ...(res.cost !== undefined ? { costUsd: res.cost } : {}),
      // Runware runs its own safety check (`safety: { checkContent: true }` is
      // set on every task in the client) and reports the verdict here. The gate
      // that blocks and refunds on it lives in the service, with the rest of the
      // money rules — an adapter reports, it does not adjudicate.
      ...(res.NSFWContent !== undefined ? { nsfw: res.NSFWContent } : {}),
      ...(res.seed !== undefined ? { seed: res.seed } : {}),
      // The client pins outputFormat: 'WEBP' on every image task, so this is a
      // fact about the request we make, not a guess about the response.
      ext: 'webp',
    }
  }

  // Unreachable in practice: this adapter never returns a 'pending' submit, so
  // nothing ever has an id to poll it with. Implemented because the seam is one
  // type, and answering with a clean error beats a throw — being asked to poll
  // an id we never minted is a caller bug, and it should read like one.
  const poll = async (providerJobId: string): Promise<ImagePollResult> => ({
    status: 'error',
    message: `runware images are synchronous and mint no job id (asked for '${providerJobId}')`,
  })

  return { submit, poll }
}
