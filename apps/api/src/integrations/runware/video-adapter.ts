// Runware → VideoProvider adapter (ADR: wan-selfhost-video-provider). Wraps the
// EXISTING RunwareClient onto the neutral seam so the generation service can
// route video through a registry without knowing about Runware nouns. The
// client file (client.ts) is deliberately UNCHANGED — all provider-specific
// mapping lives here, so Runware stays the fast tier with zero behavioral drift.
import { randomUUID } from 'node:crypto'
import type { RunwareClient } from './client'
import type { VideoPollResult, VideoProvider, VideoSubmitInput } from '../video-provider'

export function createRunwareVideoAdapter(client: RunwareClient): VideoProvider {
  return {
    async submit(input: VideoSubmitInput) {
      // The taskUUID is generated HERE, before the HTTP call, and returned as
      // the job id — exactly the pre-refactor behavior (the service used to mint
      // it). Runware dedups a retried submit on this key, and the service only
      // persists it AFTER submit resolves, keeping the submit-window race closed.
      const providerJobId = randomUUID()
      await client.submitVideo({
        taskUUID: providerJobId,
        positivePrompt: input.prompt,
        // CinemaStudio style-preset negative (omitted when empty/absent).
        ...(input.negativePrompt ? { negativePrompt: input.negativePrompt } : {}),
        model: input.model,
        width: input.width,
        height: input.height,
        duration: input.durationSeconds,
        // image→video: Runware nests the seed frame under `inputs` internally;
        // the client handles that — we just forward the neutral data URI.
        ...(input.inputImage
          ? { frameImages: [{ image: input.inputImage, frame: 'first' as const }] }
          : {}),
        // Client-internal routing metadata (ByteDance models 400 on `safety`);
        // only forwarded when the service set it from the catalog flag.
        ...(input.omitSafety ? { omitSafety: true } : {}),
      })
      return { providerJobId }
    },

    async poll(providerJobId: string): Promise<VideoPollResult> {
      const r = await client.getResponse(providerJobId)
      if (r.status === 'processing') return { status: 'processing', progress: r.progress }
      if (r.status === 'success')
        // Noun rename onto the neutral union — videoURL/imageURL/audioURL→assetUrl,
        // cost→costUsd, NSFWContent→nsfw — so the service settles identically
        // regardless of provider OR media type. CinemaStudio audio rows are
        // `provider: 'runware'`, so they poll through THIS adapter; the audioURL
        // fallback is what lets one poll path serve image/video/audio alike.
        return {
          status: 'success',
          assetUrl: r.videoURL ?? r.imageURL ?? r.audioURL,
          costUsd: r.cost,
          nsfw: r.NSFWContent,
        }
      return { status: 'error', message: r.message }
    },
  }
}
