// Curated model catalog (plan Task 7) — the single source of truth for model
// ids, display names, Runware AIR ids, aspect ratios and credit pricing.
// Prices come from research 2026-07; re-verify quarterly and run
// scripts/verify-catalog.ts against a real key before launch.
import type { CatalogModel } from '@opencreate/contracts'

// RESOLUTIONS / resolutionFor moved to @opencreate/contracts (see
// packages/contracts/src/resolution.ts): the web composer must show the user
// the exact output size before they spend credits, and a second copy of the
// table here would silently drift from the one the API sends to Runware.
// Re-exported so existing importers (runware task builder, tests) keep working.
export { RESOLUTIONS, resolutionFor } from '@opencreate/contracts'
export type { Resolution } from '@opencreate/contracts'

export const CATALOG: CatalogModel[] = [
  {
    id: 'flux-schnell',
    type: 'image',
    name: 'Flash',
    providerLabel: 'FLUX schnell',
    air: 'runware:100@1',
    tier: 'fast',
    supportsImageInput: false,
    aspectRatios: ['16:9', '1:1', '9:16'],
    credits: 1,
  },
  {
    id: 'flux-dev',
    type: 'image',
    name: 'Studio',
    providerLabel: 'FLUX dev',
    air: 'runware:101@1',
    tier: 'quality',
    supportsImageInput: false,
    aspectRatios: ['16:9', '1:1', '9:16'],
    credits: 2,
  },
  {
    // The ONLY model in this catalog that can render a TAGGED ENTITY. Neither
    // flux-schnell nor flux-dev accepts `referenceImages` (verified against
    // Runware's per-model docs, 2026-07-09) — reference conditioning lives in the
    // Kontext family and in FLUX Fill (ACE++). Without this entry the entity
    // library would have nothing to generate with.
    //
    // `resolutionProfile: 'kontext'` is load-bearing: Kontext accepts only its own
    // dimension list, so the default square1024 table's 1344x768 would earn a
    // provider 400 on every 16:9 request.
    //
    // PRICE IS PROVISIONAL. Runware lists $0.04/image at 1024x1024 — 4 credits of
    // raw cost at 1 credit = $0.01. 8 keeps roughly the margin flux-dev carries.
    // Re-verify with scripts/verify-catalog.ts against a real key before this
    // reaches paying users: a wrong number here loses money silently.
    id: 'flux-kontext-pro',
    type: 'image',
    name: 'Cast',
    providerLabel: 'FLUX.1 Kontext pro',
    air: 'bfl:3@1',
    tier: 'plus',
    supportsImageInput: false,
    aspectRatios: ['16:9', '1:1', '9:16'],
    credits: 8,
    // Faces AND objects/places: Kontext conditions on any reference subject
    referenceMode: 'both',
    // Runware documents a max of 2 reference images here. Our wire contract caps
    // entityRefs at 1 today; raising it needs no change to this entry.
    maxReferenceImages: 2,
    resolutionProfile: 'kontext',
    // Kontext is an EDIT model — it is steered by the reference image, not by a
    // negative channel, and it has none. Runware does not ignore the parameter,
    // it rejects the whole task: "Invalid parameter detected. The parameter
    // 'negativePrompt' is not recognized or supported."
    //
    // This is why it matters: this is the ONE model a Soul Studio reference sheet
    // uses for views 2-4, and a style preset always produces a negative. Before
    // this flag, every referencing view failed at the provider and refunded —
    // the sheet could never be more than its hero shot.
    supportsNegativePrompt: false,
  },
  {
    // Nano Banana Pro (Gemini 3 Pro Image) — the REFERENCE model: the one we
    // generate a character's portrait with and then re-cite in every later shot.
    // Chosen over the cheaper Nano Banana 2 (google:4@3, ~$0.069) because a
    // character reference is generated ONCE and reused for the life of the
    // entity — identity fidelity across subjects is the whole product, and the
    // per-image delta is noise against that.
    //
    // `resolutionProfile: 'nanobanana'` is load-bearing, exactly as it is for
    // Kontext: the model publishes its own dimension list per tier and rejects
    // anything outside it, so the default square1024 table's 1344×768 would earn
    // a provider 400 on every 16:9 request. We buy the 1K tier.
    //
    // IT DOES NOT UNLOCK SEEDANCE 2.0 FOR FACES. Nano Banana is a Google model,
    // and ByteDance trusts ONLY ModelArk's own outputs ("outputs from other
    // platforms are not supported") — so a Nano Banana portrait carrying a real-
    // looking face is refused by Seedance 2.0's input moderation just as a Flux
    // one is. That is not a gap to patch here: `seedance-2-0` carries no
    // `referenceMode`, so the composer filters it out the moment an entity is
    // tagged (and the API re-validates). Character shots route to Kling / Veo /
    // PixVerse / MiniMax / Wan, which have no such policy.
    //
    // PRICE: $0.138/image at 1K wholesale → 28 credits ($0.28) keeps roughly the
    // 2× margin flux-kontext-pro carries.
    id: 'nano-banana-pro',
    type: 'image',
    name: 'Muse',
    providerLabel: 'Nano Banana Pro',
    air: 'google:4@2',
    tier: 'pro',
    supportsImageInput: false,
    aspectRatios: ['16:9', '1:1', '9:16'],
    credits: 28,
    // Faces AND objects/places — it conditions on any reference subject, and
    // holds identity across several of them at once.
    referenceMode: 'both',
    // Runware documents up to 14 referenceImages here. Our wire contract still
    // caps entityRefs at 1; raising that needs no change to this entry.
    maxReferenceImages: 14,
    resolutionProfile: 'nanobanana',
  },
  // ── VIDEO DURATIONS ACTUALIZED (research 2026-07-22) ────────────────────────
  // The old [5,8] / [5,10] caps were OUR conservative config, NOT a provider
  // limit — verified against provider docs + the live Higgsfield model catalog:
  // wan 2.7 (Alibaba) 2–15s, Seedance 1.5 Pro (Runware) 4–12s, Seedance 2.0
  // (DeepInfra) 4–15s, Kling 3.0 (Runware) up to 15s, PixVerse V6 (Runware) 1–15s,
  // Veo 3.1 (Runware) 4/6/8s (8 is its real ceiling). The dashscope/Runware
  // adapters pass `duration` straight through with no clamp, so the only thing that
  // ever limited us to 10s was these tables + the web slider (SHOT_DURATIONS_SECONDS).
  // Each model keeps its measured per-second rate; existing durations/prices are
  // UNCHANGED, longer ones are ADDED (so every prior price test still holds). The
  // exact provider max is re-verified live before it can 400 — the composer snaps
  // an over-long strip down to the model's own max (nearestDuration).
  {
    id: 'pixverse-v6',
    type: 'video',
    name: 'Swift',
    providerLabel: 'PixVerse V6',
    air: 'pixverse:1@8',
    tier: 'standard',
    supportsImageInput: true,
    aspectRatios: ['16:9', '1:1', '9:16'],
    durationOptions: [5, 8, 10, 15],
    creditsByDuration: { '5': 35, '8': 56, '10': 70, '15': 105 },
    // providerSettings.pixverse.audio exists (enumerated from Runware's own
    // allowedValues — see runware/video-adapter.ts) and the with-audio rate is
    // ~2× the silent one, so audio-on is priced at 2× (owner decision
    // 2026-07-15: honest margin over a flat price).
    nativeAudio: 'switchable',
    creditsByDurationWithAudio: { '5': 70, '8': 112, '10': 140, '15': 210 },
    // PixVerse rejects Runware's `safety` param too ("Unsupported use of
    // 'safety' parameter", verified live 2026-07-30 on a canvas i2v run — the
    // allowed-params list in the error has no `safety`). Same treatment as
    // seedance-1-5-pro below: flag off so the client omits it; moderation
    // still applies via the NSFWContent flag on results. Provider drift —
    // this model accepted the param when it was added.
    supportsSafetyParam: false,
  },
  {
    id: 'minimax-hailuo',
    type: 'video',
    name: 'Motion',
    providerLabel: 'MiniMax Hailuo 2.3',
    air: 'minimax:4@1',
    tier: 'standard',
    supportsImageInput: true,
    aspectRatios: ['16:9'],
    durationOptions: [6, 10],
    creditsByDuration: { '6': 35, '10': 60 },
  },
  {
    // AIR verified live via modelSearch 2026-07-07; wholesale ~$0.026/s 720p silent
    id: 'seedance-1-5-pro',
    type: 'video',
    name: 'Pulse',
    providerLabel: 'Seedance 1.5 Pro',
    air: 'bytedance:seedance@1.5-pro',
    tier: 'standard',
    supportsImageInput: true,
    aspectRatios: ['16:9', '1:1', '9:16'],
    durationOptions: [5, 8, 10, 12],
    creditsByDuration: { '5': 35, '8': 56, '10': 70, '12': 84 },
    // ByteDance bills Seedance at EXACTLY 2× with audio ($0.0024/1k vs
    // $0.0012/1k — measured, see runware/video-adapter.ts header), so audio-on
    // carries the 2× price (owner decision 2026-07-15). The silent table above
    // keeps the margin the audio-off economics pass restored.
    nativeAudio: 'switchable',
    creditsByDurationWithAudio: { '5': 70, '8': 112, '10': 140, '12': 168 },
    // ByteDance models reject Runware's `safety` param (unsupportedParameter,
    // verified live 2026-07-08) — flag off so the client omits it. Moderation
    // still applies via the NSFWContent flag on results.
    supportsSafetyParam: false,
  },
  {
    // Wan 2.7 straight from Alibaba Cloud Model Studio — no Runware in the path.
    // `provider: 'alibaba'` routes submit/poll to the dashscope client; the `air`
    // carries the model FAMILY only (`wan2.7`), because the mode is part of their
    // model id and the adapter appends `-t2v`/`-i2v` from whether a seed frame is
    // present. The synthetic `alibaba:` prefix exists purely to satisfy the shared
    // AIR regex — it is not a Runware id, and verify-catalog skips it.
    //
    // WHY WE LEFT RUNWARE FOR THIS ONE MODEL — the numbers, not a preference:
    // Runware's markup is not flat. On Seedance it is ~0.8% (they billed $0.26136
    // where ByteDance lists $0.2592). On Wan 2.7 it is ~51%: a 5s 720p clip cost
    // us $0.7557 (measured, from the ledger) against Alibaba's published
    // $0.10/second — $0.50. Every other model stays on Runware, where the
    // aggregator is genuinely near cost.
    //
    // PRICE, recomputed from the real rate: 720p is $0.10/s, so 5s = $0.50 and 8s
    // = $0.80 wholesale. At 1 credit = $0.01, 5s at 85 credits ($0.85) leaves ~41%
    // margin and 8s at 135 ($1.35) leaves ~41%. The OLD price (55 / 88 credits)
    // was set against a cost nobody had measured and sold every clip BELOW cost:
    // $0.55 charged against $0.7557 paid, i.e. −$0.21 per generation.
    //
    // 720p is pinned by the resolution tier, deliberately: Model Studio DEFAULTS
    // to 1080P, which bills at $0.15/s — 50% more for a size the user never asked
    // for. The adapter always sends `resolution` explicitly.
    //
    // Audio: unlike the Runware path, there is no switch here. Wan 2.7 always
    // generates its own soundtrack and the $0.10/s rate includes it, so there is
    // nothing to turn off and nothing being wasted.
    id: 'wan-2-7',
    type: 'video',
    name: 'Cinema',
    providerLabel: 'Wan 2.7 · Alibaba',
    air: 'alibaba:wan2.7',
    tier: 'plus',
    supportsImageInput: true,
    aspectRatios: ['16:9', '1:1', '9:16'],
    durationOptions: [5, 8, 10, 15],
    creditsByDuration: { '5': 85, '8': 135, '10': 170, '15': 255 },
    provider: 'alibaba',
    // The direct Alibaba channel has NO audio switch — every clip ships with the
    // model's soundtrack and the $0.10/s list price already includes it, so the
    // 85/135 table above needs no with-audio twin. 'always' tells the service to
    // stamp params.audio=true on every row (render provenance) and tells the
    // composer the toggle costs nothing here.
    nativeAudio: 'always',
    // THE FIRST VIDEO MODEL THAT CAN HOLD A CHARACTER. Until now `referenceMode`
    // existed only on image models, so tagging a character produced a picture of
    // them and nothing more — every video shot invented a new stranger, which is
    // precisely why a two-shot film showed two different foxes.
    //
    // Wan 2.7's r2v mode fixes that, and the adapter reaches it automatically:
    // references present → `wan2.7-r2v`. Verified live — our fox, photographed in
    // a snowy forest, was prompted onto a tropical beach and came back as the SAME
    // fox. 'both' because it holds faces AND objects/animals alike.
    //
    // 5 references: their limit, and it is per-character, so a scene can carry a
    // whole small cast. All three modes bill identically ($0.10/s at 720P), so
    // tagging a character costs the user exactly nothing extra.
    referenceMode: 'both',
    maxReferenceImages: 5,
  },
  {
    id: 'kling-3-pro',
    type: 'video',
    name: 'Director',
    providerLabel: 'Kling 3.0 Pro',
    air: 'klingai:kling-video@3-pro',
    tier: 'pro',
    supportsImageInput: true,
    aspectRatios: ['16:9', '1:1', '9:16'],
    durationOptions: [5, 10, 15],
    creditsByDuration: { '5': 80, '10': 160, '15': 240 },
  },
  {
    id: 'veo-3-1-fast',
    type: 'video',
    name: 'Premiere',
    providerLabel: 'Veo 3.1 Fast',
    air: 'google:3@2',
    tier: 'premium',
    supportsImageInput: true,
    aspectRatios: ['16:9', '9:16'],
    durationOptions: [4, 6, 8],
    creditsByDuration: { '4': 70, '6': 105, '8': 140 },
  },
  {
    // Self-hosted Wan 2.2 on our own RunPod GPU (ADR: wan-selfhost-video-
    // provider). `provider: 'wan-runpod'` routes submit/poll to the ComfyUI
    // adapter instead of Runware; the `air` is a synthetic tag (never sent to
    // Runware, skipped by verify-catalog) that only satisfies the AIR regex.
    // t2v only for now (supportsImageInput: false). Premium async "Forge" tier.
    // KNOWN GAP: self-host has no provider-side NSFW check (ComfyUI returns
    // nsfw:false) — see the ADR's moderation-parity note before public launch.
    id: 'wan-2-2',
    type: 'video',
    name: 'Forge',
    providerLabel: 'Wan 2.2 · our GPU',
    air: 'wan-runpod:wan2.2-t2v-a14b',
    tier: 'premium',
    supportsImageInput: false,
    aspectRatios: ['16:9', '9:16', '1:1'],
    durationOptions: [5],
    creditsByDuration: { '5': 60 },
    provider: 'wan-runpod',
  },
  {
    // Seedance 2.0 straight from ByteDance ModelArk — no Runware in the path
    // (ADR: seedance-direct-bytedance). `provider: 'bytedance'` routes submit/poll
    // to the ark-client; the `air` wraps the REAL ModelArk id behind a synthetic
    // `bytedance:` prefix purely to satisfy the shared AIR regex (the adapter
    // strips it, and verify-catalog skips it — it is not a Runware id).
    //
    // The `dreamina-` in the model id is MANDATORY and is not a typo: ByteDance
    // prefixes the 2.0 generation with it while 1.x carries no prefix. Drop it and
    // every call 404s.
    //
    // PINNED TO 720p via resolutionProfile, deliberately. Left to the tier ladder
    // a 'premium' model would read the fhd table and render 1080p — which on this
    // provider costs $1.87/5s wholesale instead of $0.76, i.e. the tier label would
    // silently multiply our cost by 2.5×. At 720p Seedance 2.0's own dimension
    // table IS our hd table (1280×720 / 960×960 / 720×1280), so what the composer
    // promises is exactly what renders.
    //
    // PRICE: wholesale is $0.756 per 5s 720p clip (108k tokens × $0.0070/1k — the
    // NO-video-input rate; the widely-quoted $0.0043 applies only when a VIDEO is
    // supplied as input, which we never do). At 1 credit = $0.01, 130 credits =
    // $1.30 leaves ~42% margin. Do NOT drop this to the 35-credit standard tier:
    // that tier does not cover Seedance 2.0 at ANY provider and every clip would
    // be sold below cost.
    //
    // KNOWN CONSTRAINT (product, not bug): the 2.0 series REFUSES any input image
    // containing a real human face — only ByteDance's own recent outputs, their
    // preset digital characters, or identity-verified assets are trusted. i2v is
    // still offered because it works for everything else (landscape, product,
    // animal, illustration); a refused portrait comes back as a refundable
    // 'content_blocked' with a message naming the real reason.
    //
    // ROUTED THROUGH DEEPINFRA, NOT BYTEDANCE DIRECT — and the reason is not price.
    // The direct channel (ark-client.ts, still built and still tested) refuses to
    // run a single frame: `ModelNotOpen`, i.e. the account must first BUY a
    // Seedance 2.0 resource pack — $30.10 minimum, 90-day expiry, non-refundable,
    // and not even purchasable inside the console (it lives on a marketing page).
    // That wall is why this row was dead.
    //
    // DeepInfra resells the SAME model at the SAME price with no activation, no
    // prepay and no minimum. Their headline "$4.30/M tokens" is the WITH-VIDEO-INPUT
    // rate; their own pricing string reads "$4.3/M with video, $7/M without for
    // 480p and 780p". We send text or an image, never a video, so we pay $7/M —
    // which IS ByteDance's own $0.0070/1k. Nobody is cheaper; the win is that
    // nobody has to buy anything first. The 130-credit price therefore stands
    // unchanged (~42% margin against $0.756).
    //
    // The ark-client stays: if the pack is ever bought, flipping `provider` back is
    // a one-word change, and its tests already pin the wire contract.
    //
    // NO `referenceMode` YET, deliberately: DeepInfra takes references as URLs or
    // `asset://` ids — NOT the data URIs the service resolves entity photos into.
    // Declaring the capability before that gap is closed would let a user tag a
    // character, pay, and receive a stranger. That is the next piece of work, not
    // an oversight.
    id: 'seedance-2-0',
    type: 'video',
    name: 'Auteur',
    providerLabel: 'Seedance 2.0 · ByteDance',
    air: 'deepinfra:ByteDance/Seedance-2.0',
    tier: 'premium',
    supportsImageInput: true,
    aspectRatios: ['16:9', '1:1', '9:16'],
    durationOptions: [5, 10, 15],
    creditsByDuration: { '5': 130, '10': 260, '15': 390 },
    resolutionProfile: 'hd',
    provider: 'deepinfra',
  },
  {
    // CinemaStudio audio — voiceover (TTS). Runware audioInference, verified to
    // expose Russian voices. Priced flat per utterance (~$0.035/1k chars whole-
    // sale). aspectRatios carries a throwaway '16:9' only to satisfy catalogBase's
    // min(1) — the audio path never reads it.
    id: 'voiceover',
    type: 'audio',
    name: 'Голос',
    providerLabel: 'Inworld TTS 2',
    air: 'inworld:tts@2',
    tier: 'standard',
    supportsImageInput: false,
    aspectRatios: ['16:9'],
    credits: 8,
    audioKind: 'tts',
    voices: ['Svetlana', 'Elena', 'Dmitry', 'Nikolai', 'Ashley', 'Alex'],
  },
  {
    // CinemaStudio audio — music bed. Runware audioInference, MiniMax Music 2.6
    // (~$0.15 per ~3-min track). The prompt is the positive music prompt; the
    // audio adapter sends settings.instrumental for a clean background bed.
    id: 'music',
    type: 'audio',
    name: 'Музыка',
    providerLabel: 'MiniMax Music 2.6',
    air: 'minimax:music@2.6',
    tier: 'plus',
    supportsImageInput: false,
    aspectRatios: ['16:9'],
    credits: 20,
    audioKind: 'music',
  },
  // ── Studio3D (ADR: photo-to-3d-studio) ──────────────────────────────────────
  // Runware's 3dInference task type. Prices verified 2026-07-11; the response's
  // `cost` field is what we actually bill against (it SCALES with the quality
  // settings), so these list prices seed the credit table, not the ledger.
  //
  // 3D has no aspect ratio. catalogBase requires >=1, so each entry carries a
  // single throwaway '1:1' the service never reads — the model3d path skips
  // resolution entirely, exactly as the audio path does.
  {
    id: 'trellis-2',
    type: 'model3d',
    name: 'Sketch',
    providerLabel: 'TRELLIS.2',
    air: 'microsoft:trellis-2@4b',
    tier: 'fast',
    supportsImageInput: true,
    aspectRatios: ['1:1'],
    // $0.0256 raw. MIT-licensed and an order of magnitude cheaper than the rest —
    // this is the tier that makes 3D feel free enough to play with.
    credits: 6,
    pbr: true,
  },
  {
    id: 'hunyuan-3d-rapid',
    type: 'model3d',
    name: 'Solid',
    providerLabel: 'Hunyuan 3D 3.1 Rapid',
    air: 'tencent:hunyuan-3d@3.1-rapid',
    tier: 'standard',
    supportsImageInput: true,
    aspectRatios: ['1:1'],
    credits: 45, // $0.225 raw
    pbr: true,
  },
  {
    id: 'tripo-3d',
    type: 'model3d',
    name: 'Sculpt',
    providerLabel: 'Tripo 3D v3.1',
    air: 'tripo:v3.1@0',
    tier: 'quality',
    supportsImageInput: true,
    aspectRatios: ['1:1'],
    credits: 80, // $0.40 raw
    pbr: true,
  },
]

export function getModel(id: string): CatalogModel | undefined {
  return CATALOG.find((m) => m.id === id)
}

export function creditsFor(model: CatalogModel, duration?: number, withAudio = false): number {
  // Image, audio and model3d are flat-priced per generation (a picture, a song,
  // an utterance, a mesh); only video prices by duration. `duration` is optional
  // so callers pricing a flat model (e.g. the 3D tiers) don't have to pass
  // `undefined` explicitly.
  if (model.type === 'image' || model.type === 'audio' || model.type === 'model3d') return model.credits
  if (duration === undefined) throw new Error('duration required for video')
  // Native audio ON reads the with-audio table on 'switchable' models — the
  // provider bills sound separately (ByteDance: exactly 2×), so the silent price
  // would sell it below margin. 'always' models (Wan 2.7) include audio in the
  // base table, and a model with no nativeAudio never reaches here with
  // withAudio=true (the service refuses the request before pricing it) — the
  // throw is the config-drift backstop, not a user-facing path.
  if (withAudio && model.nativeAudio === 'switchable') {
    const audioCredits = model.creditsByDurationWithAudio?.[String(duration)]
    if (!audioCredits)
      throw new Error(`no with-audio price for duration ${duration} on ${model.id}`)
    return audioCredits
  }
  const credits = model.creditsByDuration[String(duration)]
  if (!credits) throw new Error(`unsupported duration ${duration} for ${model.id}`)
  return credits
}
