// Runware `3dInference` → the neutral Mesh3dProvider. Mirrors video-adapter.ts:
// the client (client.ts) stays UNCHANGED and provider-shaped, and every Runware
// noun is renamed onto the neutral union HERE (meshURL→assetUrl, cost→costUsd),
// so the generation service settles a 3D row with the identical code path it
// already uses for video and audio.
import type { Mesh3dProvider, Mesh3dSubmitInput, MeshPollResult } from '../mesh-provider'
import type { RunwareClient } from './client'

export function createRunwareMeshAdapter(client: RunwareClient): Mesh3dProvider {
  return {
    async submit(input: Mesh3dSubmitInput) {
      await client.submit3d({
        taskUUID: input.taskUUID,
        model: input.model,
        // The client nests this under `inputs.images` — a flat `inputImage` is
        // silently ignored by Runware. We just forward the neutral data URI.
        inputImage: input.inputImage,
        // Spread-if-present, never `pbr: undefined`: an explicit undefined key can
        // still serialize as a param, and an unknown param is a 400 from Runware.
        ...(input.pbr !== undefined ? { pbr: input.pbr } : {}),
        ...(input.faceLimit !== undefined ? { faceLimit: input.faceLimit } : {}),
      })
      // Runware mints no id of its own — the taskUUID we supplied IS the handle,
      // and it is what getResponse is keyed on.
      return { providerJobId: input.taskUUID }
    },

    async poll(providerJobId: string): Promise<MeshPollResult> {
      const r = await client.getResponse(providerJobId)
      if (r.status === 'processing') return { status: 'processing', progress: r.progress }
      if (r.status === 'error') return { status: 'error', message: r.message }
      return {
        status: 'success',
        // Undefined when the provider claimed success with no file. Passed through
        // AS undefined so the service's no-asset guard fails the row and refunds —
        // never invent a URL and never throw here, or that guard is bypassed.
        ...(r.meshURL !== undefined ? { assetUrl: r.meshURL } : {}),
        // Bill from what the provider actually charged: 3D cost scales with the pbr
        // and faceLimit knobs, so a catalog list price would be wrong.
        ...(r.cost !== undefined ? { costUsd: r.cost } : {}),
        // 3dInference exposes NO moderation signal (ADR consequences). Reporting
        // false makes the gap explicit rather than accidental: the §9.4 NSFW gate
        // never fires for 3D, exactly as it does not for the self-hosted wan-runpod.
        nsfw: false,
      }
    },
  }
}
