// The ImageProvider seam. Until now images were the ONE generation type wired
// straight to a single vendor: `service.ts` called `runware.imageInference()`
// inline, and a comment there said images were "deliberately never routed
// through the provider registry". Seedream 5 on kie.ai is what ends that — the
// same reason the video seam exists, arrived at from the same direction (price,
// and not being one vendor's outage away from having no product).
//
// TWO SHAPES BEHIND ONE SEAM, AND THAT IS THE WHOLE DESIGN PROBLEM. Runware's
// image call is SYNCHRONOUS: one request returns the finished picture. kie.ai's
// is a TASK: it returns a taskId that has to be polled. Forcing Runware into
// submit/poll would mean holding a finished image in an in-process Map until
// someone polls for it — exactly the pattern `deepinfra-client.ts` documents as
// its own worst property, where a deploy loses every in-flight job.
//
// So `submit()` returns a DISCRIMINATED UNION instead: 'done' carries the asset
// (the service settles inside the same request, byte-for-byte the behaviour
// images have always had), 'pending' carries a job id (the service parks the row
// as processing and the existing poll lifecycle — throttle, stale reaper,
// refund-once — takes over, unchanged). Neither backend is bent into the other's
// shape, and no money rule moves.
import type { AspectRatio, ApiErrorCode, ImageProviderId, SeedreamQuality } from '@opencreate/contracts'

export type { ImageProviderId }

// A tagged-entity reference photo, carried in BOTH forms because the two
// backends want different ones and neither can derive the other.
//
// Runware takes the bytes inline (a data URI), which is what the service has
// always resolved an entity photo into. kie.ai takes URLs ONLY — its schema
// rejects a data URI outright, the same constraint the kie VIDEO adapter already
// documents for `input_urls`. Our `/media/*` is public by design (unguessable
// keys, because <img> cannot send an auth header), so a stored asset HAS a
// fetchable URL — but only where the deployment has a public origin at all.
//
// `publicUrl: null` therefore means "local dev, or an asset not stored yet", and
// the kie adapter refuses the job with a clean provider error rather than
// silently dropping the reference and charging for a picture of the wrong person.
export type ImageReference = {
  dataUri: string
  publicUrl: string | null
}

// What the service hands an image backend at submit time. Provider-neutral: the
// service has already composed the prompt, resolved width/height from the
// catalogue aspect ratio, authorized the references and charged the user.
export type ImageSubmitInput = {
  prompt: string
  // Style/framing preset negative (absent → not sent). A backend with no
  // negative channel ignores it; the catalogue's `supportsNegativePrompt` is
  // what stops one being composed in the first place.
  negativePrompt?: string | undefined
  // The model handle PER BACKEND, because one catalogue entry names a different
  // id at each of them: Runware wants an AIR ('runware:100@1'), kie.ai wants its
  // own ('seedream/5-lite-text-to-image'). A single `model` string cannot serve a
  // failover chain — whichever spelling it held would be wrong at the other link.
  //
  // A MISSING key is meaningful, not an oversight: it says that backend cannot
  // run this model, and the chain skips it rather than sending an id the vendor
  // will reject. So a Runware-only entry costs no failed kie call at all.
  models: Partial<Record<ImageProviderId, string>>
  width: number
  height: number
  // The ratio as the user chose it. kie takes a ratio ENUM rather than pixels,
  // so passing the ratio through spares that adapter re-deriving it from
  // width/height and disagreeing with the catalogue about what 16:9 rounds to.
  aspectRatio: AspectRatio
  // Seedream's output-size ladder, from the catalogue entry. Ignored by backends
  // that take explicit dimensions (Runware).
  quality?: SeedreamQuality | undefined
  referenceImages?: ImageReference[] | undefined
  seed?: number | undefined
}

// A finished image, whoever produced it and however long it took.
type ImageAsset = {
  // Where the asset can be downloaded from (storage.saveFromUrl, SSRF-
  // allowlisted). The service copies it into our own storage immediately —
  // provider URLs expire.
  assetUrl: string
  // Operator cost estimate in USD (margin dashboards only — never touches credit
  // correctness). kie reports `creditsConsumed`, which the adapter converts.
  costUsd?: number | undefined
  // Content-safety flag on the OUTPUT. The gate blocks + refunds when true.
  nsfw?: boolean | undefined
  // Echoed back so the row records what actually ran, as the Runware path
  // already does in paramsJson.
  seed?: number | undefined
  // The extension the asset must be STORED under. Not cosmetic: /media/* is
  // served by @fastify/static, which types the response from the file suffix, so
  // a PNG written as .webp reaches the browser mislabelled. Runware returns webp
  // (which is why the old inline path could hardcode it); Seedream returns
  // whatever `output_format` asked for. Absent → the caller's default.
  ext?: 'webp' | 'png' | 'jpeg' | undefined
}

// submit()'s two shapes. See the header: this union IS the reason the seam fits
// both a synchronous and an asynchronous backend without either being bent.
export type ImageSubmitResult =
  | ({ kind: 'done' } & ImageAsset)
  | { kind: 'pending'; providerJobId: string }

// The three poll outcomes the service already knows how to settle — deliberately
// the same shape the video seam uses, because they are settled by the same money
// code. Kept as its own declaration rather than an alias of VideoPollResult: an
// image has no duration and no progress percentage worth reporting, and a type
// named "video" appearing in the image path is how the next reader gets confused.
export type ImagePollResult =
  | { status: 'processing' }
  | ({ status: 'success' } & ImageAsset)
  | {
      status: 'error'
      message: string
      // The provider refused the INPUT on content grounds (as opposed to `nsfw`,
      // which flags a finished-but-unsafe OUTPUT). Same refund either way — only
      // the sentence the user reads differs.
      blocked?: boolean | undefined
      // Machine-readable category for surfaces that render localized copy rather
      // than `message`. Absent → the caller falls back to 'provider_error'.
      code?: ApiErrorCode | undefined
    }

// The whole seam. Two operations, exactly as the video one: submit a job, then
// poll it — and for a synchronous backend, poll is never reached.
export type ImageProvider = {
  submit(input: ImageSubmitInput): Promise<ImageSubmitResult>
  // Called only for a 'pending' submit, with the id that submit returned. A
  // synchronous adapter still has to implement it (the seam is one type), and
  // answers with a clean error: being asked to poll an id it never minted is a
  // bug in the caller, not a provider outage.
  poll(providerJobId: string): Promise<ImagePollResult>
}
