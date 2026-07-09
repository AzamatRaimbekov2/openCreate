// The VideoProvider seam (ADR: wan-selfhost-video-provider). The generation
// lifecycle performs exactly two provider operations on a video job — submit it,
// then poll it — so the abstraction is those two calls and nothing more. Every
// money-path invariant (charge-at-submit, refund-once, stale reaper, poll
// throttle) lives in the service and is UNCHANGED by this seam: the service
// switches on the SAME neutral union regardless of which backend produced it.
//
// The types are deliberately provider-neutral (renamed off Runware nouns):
// `assetUrl` (was videoURL/imageURL), `costUsd` (was cost), `nsfw` (was
// NSFWContent). A Runware adapter maps the existing RunwareClient 1:1 onto this
// shape; the wan-runpod adapter maps our self-hosted ComfyUI worker onto it.
import type { VideoProviderId } from '@opencreate/contracts'

export type { VideoProviderId }

// What the service hands a provider at submit time. Provider-neutral: the
// service resolves width/height from the catalog aspect ratio and passes the
// duration in seconds — each adapter derives whatever its backend wants from
// these (Runware takes seconds directly; ComfyUI derives frame count).
export type VideoSubmitInput = {
  prompt: string
  // CinemaStudio style-preset negative prompt (empty/absent → not sent). Steers
  // the model away from the wrong medium (a Disney render must push off
  // "photorealistic, live action"). Runware forwards it; the wan-runpod ComfyUI
  // adapter ignores it (its workflow has no negative slot wired yet).
  negativePrompt?: string | undefined
  width: number
  height: number
  durationSeconds: number
  // Backend model handle. For Runware this is the AIR id; for wan-runpod it is
  // ignored (the workflow already pins the Wan 2.2 weights).
  model: string
  // image→video seed frame as a data URI (never a URL). Providers that only do
  // text→video (wan-runpod today) ignore it.
  inputImage?: string | undefined
  // Optional deterministic seed. Absent → the adapter picks a random one.
  seed?: number | undefined
  // Runware-internal routing: some models 400 on Runware's `safety` param, so
  // the service forwards the catalog flag and the Runware adapter omits it.
  // Other providers ignore this field entirely.
  omitSafety?: boolean | undefined
}

// The three poll outcomes the service already knows how to settle. Discriminated
// on `status` so an adapter must map its backend into exactly one of them and
// the service's switch stays exhaustive.
export type VideoPollResult =
  | { status: 'processing'; progress: number | null }
  | {
      status: 'success'
      // Where the finished asset can be downloaded from (storage.saveFromUrl,
      // SSRF-allowlisted). Absent = provider claimed success with no asset →
      // the service treats it as a failure and refunds.
      assetUrl?: string | undefined
      // Operator cost estimate in USD (margin dashboards only — never touches
      // credit correctness). Optional: self-host has no per-call invoice.
      costUsd?: number | undefined
      // Content-safety flag. The §9.4 gate blocks + refunds when true. A
      // provider with no moderation of its own returns false (documented gap).
      nsfw?: boolean | undefined
    }
  | { status: 'error'; message: string }

// The whole seam: submit returns an opaque provider job id the service persists
// and later polls with. Two operations, mirroring the two the lifecycle runs.
export type VideoProvider = {
  submit(input: VideoSubmitInput): Promise<{ providerJobId: string }>
  poll(providerJobId: string): Promise<VideoPollResult>
}
