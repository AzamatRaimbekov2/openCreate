// Wire types for the Runware REST API (plan Task 8). Field names mirror the
// Runware task schema exactly (positivePrompt, taskUUID, NSFWContent…) so the
// client can spread requests straight into the task envelope without mapping.
// Optional props are declared `| undefined` because this repo compiles with
// exactOptionalPropertyTypes and the client builds these objects from
// `unknown` JSON fields.

export type RunwareImageRequest = {
  taskUUID: string
  positivePrompt: string
  model: string
  width: number
  height: number
  seed?: number | undefined
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
  model: string
  width: number
  height: number
  duration: number
  // image→video: the input frame(s); Runware nests these under `inputs`.
  frameImages?: Array<{ image: string; frame: 'first' | 'last' }> | undefined
}

// Discriminated on `status` so callers must handle all three poll outcomes.
export type RunwarePollResult =
  | { status: 'processing'; progress: number | null }
  | {
      status: 'success'
      videoURL?: string | undefined
      imageURL?: string | undefined
      cost?: number | undefined
      NSFWContent?: boolean | undefined
    }
  | { status: 'error'; message: string }
