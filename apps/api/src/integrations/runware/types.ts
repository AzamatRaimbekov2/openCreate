// Wire types for the Runware REST API (plan Task 8). Field names mirror the
// Runware task schema exactly (positivePrompt, taskUUID, NSFWContent…) so the
// client can spread requests straight into the task envelope without mapping.
// Optional props are declared `| undefined` because this repo compiles with
// exactOptionalPropertyTypes and the client builds these objects from
// `unknown` JSON fields.

export type RunwareImageRequest = {
  taskUUID: string
  positivePrompt: string
  // CinemaStudio style-preset negative prompt; spreads flat into the image task
  // (Runware accepts `negativePrompt` on imageInference). Optional/absent → not sent.
  negativePrompt?: string | undefined
  model: string
  width: number
  height: number
  seed?: number | undefined
  // Tagged-entity conditioning (entity library). Runware accepts a UUID, a URL,
  // a bare base64 string, or a data URI. We send DATA URIs: our /media paths are
  // not publicly reachable in dev or behind a private asset host, so a URL would
  // fail exactly where we test it. Only models whose catalog entry declares a
  // `referenceMode` may carry this — the generation service enforces that.
  referenceImages?: string[] | undefined
}

export type RunwareImageResult = {
  imageURL: string
  seed?: number | undefined
  cost?: number | undefined
  NSFWContent?: boolean | undefined
}

export type RunwareVideoRequest = {
  taskUUID: string
  positivePrompt: string
  // CinemaStudio style-preset negative prompt; spreads flat into the video task
  // (Runware accepts `negativePrompt` on videoInference). Optional/absent → not sent.
  negativePrompt?: string | undefined
  model: string
  width: number
  height: number
  duration: number
  // image→video: the input frame(s); Runware nests these under `inputs`.
  frameImages?: Array<{ image: string; frame: 'first' | 'last' }> | undefined
  // Some providers (ByteDance/Seedance) reject Runware's `safety` task param
  // as unsupportedParameter — when true the client omits it entirely. This is
  // client-internal routing metadata and is never sent to Runware.
  omitSafety?: boolean | undefined
}

// CinemaStudio audio (Runware audioInference — same envelope as videoInference,
// same taskUUID, same getResponse polling). The client builds the task-specific
// shape from `audioKind`: TTS sends `speech.{text,voice}`, music sends
// `positivePrompt` + `settings.instrumental`. Kept neutral here so the client
// owns the Runware nouns and the adapter owns the mapping.
export type RunwareAudioRequest = {
  taskUUID: string
  model: string
  audioKind: 'music' | 'tts'
  // TTS: the spoken text + voice id. Ignored for music.
  text?: string | undefined
  voice?: string | undefined
  // Music: the positive music prompt. Ignored for TTS.
  positivePrompt?: string | undefined
}

// Studio3D image→3D (Runware `3dInference`: TRELLIS.2 / Hunyuan3D / Tripo /
// Meshy). Async submit-then-poll, same taskUUID + getResponse contract as video.
export type Runware3dRequest = {
  taskUUID: string
  model: string
  // A data URI. Runware accepts a UUID, a URL, a bare base64 string or a data
  // URI; we send a data URI for the same reason the image path does — the API
  // never hands a provider a user-supplied URL to fetch.
  inputImage: string
  // Quality knobs. Runware's returned `cost` SCALES WITH THESE, which is why the
  // settled row bills from the poll response's cost field and never from the
  // catalog list price.
  pbr?: boolean | undefined
  faceLimit?: number | undefined
}

// Discriminated on `status` so callers must handle all three poll outcomes.
export type RunwarePollResult =
  | { status: 'processing'; progress: number | null }
  | {
      status: 'success'
      videoURL?: string | undefined
      imageURL?: string | undefined
      // audioInference returns audioURL; the video adapter maps it into the
      // neutral assetUrl exactly like videoURL/imageURL, so the settlement path
      // in the generation service is shared across all three media types.
      audioURL?: string | undefined
      // 3dInference does NOT use the flat *URL shape — the finished GLB arrives
      // under `outputs.files[0].url`. The client normalizes it to this field so
      // callers keep one settlement path across all four media types.
      meshURL?: string | undefined
      cost?: number | undefined
      NSFWContent?: boolean | undefined
    }
  | { status: 'error'; message: string }
