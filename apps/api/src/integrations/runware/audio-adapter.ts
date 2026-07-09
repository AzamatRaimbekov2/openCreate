// Runware → AudioProvider adapter (ADR: cinema-studio §1). Mirrors the video
// adapter: wraps the EXISTING RunwareClient onto the neutral AudioProvider seam
// so the generation service submits audio without knowing Runware nouns. The
// client (client.ts) owns the TTS-vs-music task shaping; this file only mints the
// job id and maps the neutral input onto RunwareAudioRequest.
import { randomUUID } from 'node:crypto'
import type { RunwareClient } from './client'
import type { AudioProvider, AudioSubmitInput } from '../audio-provider'

export function createRunwareAudioAdapter(client: RunwareClient): AudioProvider {
  return {
    async submit(input: AudioSubmitInput) {
      // Same discipline as the video adapter: mint the taskUUID HERE, before the
      // HTTP call, and return it as the job id. Runware dedups a retried submit
      // on this key, and the service only persists it AFTER submit resolves, so
      // the submit-window race stays closed for audio exactly as for video.
      const providerJobId = randomUUID()
      await client.submitAudio({
        taskUUID: providerJobId,
        model: input.model,
        audioKind: input.audioKind,
        // TTS reads the prompt as spoken text + a voice; music reads it as the
        // positive music prompt. The client turns these into the right task shape.
        ...(input.audioKind === 'tts'
          ? { text: input.prompt, voice: input.voice }
          : { positivePrompt: input.prompt }),
      })
      return { providerJobId }
    },
  }
}
