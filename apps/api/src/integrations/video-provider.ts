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
import type { ApiErrorCode, StyleId, VideoProviderId } from '@opencreate/contracts'

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
  // Tagged-character reference photos, as data URIs. NOT a seed frame: a seed
  // frame is the literal first picture of the clip, whereas a reference says
  // "whoever this is, that is who appears" — the character can be somewhere else
  // entirely, in a different pose, in a different scene. It is what turns a pile
  // of clips into a film: tag the character once and shot 2 shows the same one.
  //
  // Already resolved and authorized by the service (entity → photo → data URI)
  // and validated against the model's `referenceMode` / `maxReferenceImages`
  // BEFORE the user is charged. A provider whose backend has no reference mode
  // simply ignores this; the composed prompt still names the character either way.
  referenceImages?: string[] | undefined
  // Optional deterministic seed. Absent → the adapter picks a random one.
  seed?: number | undefined
  // Runware-internal routing: some models 400 on Runware's `safety` param, so
  // the service forwards the catalog flag and the Runware adapter omits it.
  // Other providers ignore this field entirely.
  omitSafety?: boolean | undefined
  // Native generation audio. The SERVICE has already validated the capability
  // (catalog `nativeAudio`) and priced it (with-audio table) before this flag is
  // set — an adapter only translates it into its backend's spelling (Runware:
  // per-family providerSettings/settings audio key). Absent/false = the audio
  // kill-switch stays on, which is the money rule the adapters were built on.
  // Providers with no switch (direct Alibaba: always-on) ignore it.
  audio?: boolean | undefined
  // The chosen style preset id, forwarded so an adapter can reach for its
  // backend's NATIVE style control instead of relying on prompt text alone.
  // PixVerse ships real cartoon modes (anime / 3d_animation / clay / comic /
  // cyberpunk) — a first-class knob that steers the model far harder than a
  // prompt fragment can. Providers with no such control simply ignore this: the
  // composed prompt already carries the style fragment either way, so passing it
  // is additive and never changes behaviour for a backend that does not use it.
  styleId?: StyleId | undefined
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
      // The provider's RAW terminal envelope, JSON-stringified. DIAGNOSTICS ONLY —
      // never user-facing copy, never parsed for behaviour. Populated by adapters
      // whose response shape is not yet pinned down, so an operator page can show
      // what actually came back instead of an engineer paying for another render to
      // find out. Absent everywhere else.
      raw?: string | undefined
    }
  | {
      status: 'error'
      message: string
      // The provider refused this job on CONTENT grounds, not infrastructure
      // ones. Distinct from `nsfw` above: that flags a finished-but-unsafe
      // OUTPUT, whereas this covers a provider that never produced anything
      // because it rejected the INPUT (ByteDance's Seedance 2.0 declines any
      // image carrying a real human face) or killed its own output mid-flight.
      // The service maps it to the SAME user-facing 'content_blocked' code and
      // the SAME refund — the money path is identical, only the explanation the
      // user reads differs, and "your portrait was refused" beats "provider
      // error" every time. Absent/false = an ordinary provider failure.
      blocked?: boolean | undefined
      // Machine-readable category, for surfaces that must render LOCALIZED copy
      // rather than `message`. Absent → the caller falls back to 'provider_error'.
      //
      // Exists because `message` is sanitized but still PROSE: "DeepInfra balance is
      // empty (HTTP 402)" names a provider and a status code, so a page that prints
      // it is printing raw server text. The adapter knows the category for certain —
      // making it say so beats every consumer re-deriving it by matching strings.
      code?: ApiErrorCode | undefined
      // Raw terminal envelope — same contract as on the success branch above:
      // diagnostics only, never rendered as failure copy.
      raw?: string | undefined
    }

// The whole seam: submit returns an opaque provider job id the service persists
// and later polls with. Two operations, mirroring the two the lifecycle runs.
export type VideoProvider = {
  submit(input: VideoSubmitInput): Promise<{ providerJobId: string }>
  poll(providerJobId: string): Promise<VideoPollResult>
}
