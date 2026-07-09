// The AudioProvider seam (ADR: cinema-studio §1). CinemaStudio audio (music beds
// + voiceover) rides the SAME async lifecycle as video — charge-at-submit, poll,
// refund-once, stale reaper — so the seam is deliberately minimal: audio differs
// from video ONLY in how a job is submitted (a different provider task shape with
// no width/height/duration). Polling is IDENTICAL to video (getResponse → the
// neutral VideoPollResult), so this seam has no `poll` of its own: an audio job
// is `provider: 'runware'` on its row and is polled through the video provider
// registry, whose Runware adapter now maps audioURL into assetUrl.
//
// This is the whole reason audio is not a new subsystem: one submit method, and
// every money-path invariant in the generation service is reused unchanged.

// What the service hands an audio provider at submit time. Provider-neutral:
// `prompt` is the music positive prompt OR the TTS spoken text (chosen by
// `audioKind`); `voice` is the TTS voice id (ignored for music).
export type AudioSubmitInput = {
  prompt: string
  // Backend model handle (Runware AIR id).
  model: string
  audioKind: 'music' | 'tts'
  voice?: string | undefined
}

// The seam: submit returns an opaque provider job id the service persists (in
// the same runwareTaskUuid column video uses) and later polls with — via the
// video registry, not here.
export type AudioProvider = {
  submit(input: AudioSubmitInput): Promise<{ providerJobId: string }>
}
