// Runware → VideoProvider adapter (ADR: wan-selfhost-video-provider). Wraps the
// EXISTING RunwareClient onto the neutral seam so the generation service can
// route video through a registry without knowing about Runware nouns. The
// client file (client.ts) is deliberately UNCHANGED — all provider-specific
// mapping lives here, so Runware stays the fast tier with zero behavioral drift.
import { randomUUID } from 'node:crypto'
import type { RunwareClient } from './client'
import type { VideoPollResult, VideoProvider, VideoSubmitInput } from '../video-provider'

// NATIVE AUDIO IS OFF BY DEFAULT, AND THAT IS A MONEY RULE.
// (2026-07-15: a request may now turn it ON — but only after the SERVICE has
// validated the catalog capability and charged the with-audio price. This file
// still hard-defaults to false: an adapter that guessed "on" would re-open the
// exact 2× leak documented below.)
//
// ByteDance bills Seedance 1.5 Pro at $0.0024/1k tokens WITH audio and $0.0012/1k
// WITHOUT — exactly 2×. Their default is ON and Runware forwards that default, so
// a request that says nothing about audio pays double. Measured: a 5s 720p clip
// cost $0.26136 (the with-audio rate) against our 35-credit ($0.35) price — 25%
// margin where the silent variant gives 63%. Wan 2.7 was worse: $0.7557 against a
// 55-credit ($0.55) price, i.e. sold BELOW cost.
//
// And the soundtrack is waste, not a feature: CinemaStudio generates its own
// voiceover (Inworld TTS) and music, and the ffmpeg render muxes those over the
// clip — the model's own audio track is discarded. The DIRECT ByteDance adapter
// already refuses it for exactly this reason (`generate_audio: false`, see
// ark-client.ts header); the Runware path simply never did.
//
// Each family spells the switch differently and 400s on keys it does not know
// (`unsupportedParameter`), so this table is exact, not clever. It was enumerated
// from Runware's own `allowedValues` errors, per model:
//   bytedance → providerSettings.bytedance: cameraFixed | audio | draft
//   pixverse  → providerSettings.pixverse:  style | audio | thinking | multiClip
//   alibaba   → NO providerSettings namespace at all; a TOP-LEVEL `settings`
//               object instead: promptExtend | promptEnhancer | audio
//   minimax   → providerSettings.minimax: promptOptimizer  (no audio switch)
// An unlisted family gets NOTHING: guessing a key is a 400, and a 400 is a dead
// generation. Silence is the safe default — add a family only after verifying it.

// PixVerse's NATIVE style modes, from Runware's own allowedValues for
// providerSettings.pixverse.style: anime | 3d_animation | clay | comic |
// cyberpunk. A real mode steers the model far harder than a prompt fragment, and
// cartoons are what this product makes — yet we were sending none of them.
//
// Only styles with a genuine counterpart map. `cinematic` is deliberately absent:
// its honest counterpart is "no style", and forcing `comic` onto a live-action
// look would be a regression. An unmapped style is not a downgrade — the composed
// prompt still carries the style fragment; it is simply prompt-only.
const PIXVERSE_STYLE: Partial<Record<string, string>> = {
  anime: 'anime',
  '3d-cartoon': '3d_animation',
  '2d-cartoon': 'comic',
  // Disney's look IS 3D feature animation; 3d_animation is the closest real mode.
  disney: '3d_animation',
}

// Everything a Runware video task needs beyond the neutral fields: the audio
// kill-switch (money) and, for PixVerse, the native style mode (quality). Both
// live in the same per-family namespace, so they are built together — a second
// spread would silently overwrite the first.
type RunwareExtras = {
  providerSettings?: Record<string, Record<string, unknown>>
  settings?: Record<string, unknown>
}

// `audio` arrives from the service ONLY after the capability was validated and
// the with-audio price charged (catalog `nativeAudio` + creditsByDurationWithAudio).
// The parameter defaults to false so every caller that says nothing keeps the
// silent rate — the 2× leak this table was built to close.
export function runwareExtrasFor(air: string, styleId?: string, audio = false): RunwareExtras {
  const family = air.split(':')[0] ?? ''

  if (family === 'pixverse') {
    const style = styleId ? PIXVERSE_STYLE[styleId] : undefined
    return { providerSettings: { pixverse: { audio, ...(style ? { style } : {}) } } }
  }
  // ByteDance takes cameraFixed | audio | draft — a `style` key here is a 400.
  if (family === 'bytedance') return { providerSettings: { bytedance: { audio } } }
  // Wan/alibaba has NO providerSettings namespace: promptExtend | promptEnhancer |
  // audio live in a TOP-LEVEL `settings` object instead.
  if (family === 'alibaba') return { settings: { audio } }
  // MiniMax exposes only promptOptimizer; anything else 400s. An unverified family
  // gets nothing — guessing a key kills the generation, so silence is the default.
  // (This is also why the catalog gives minimax-hailuo no `nativeAudio`: the
  // service refuses audio:true before it could ever reach this branch.)
  return {}
}

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
        // Per-family knobs: the audio switch (default OFF — we pay 2× for a
        // soundtrack the render discards; ON only when the service charged the
        // with-audio price) plus PixVerse's native cartoon mode. See above.
        ...runwareExtrasFor(input.model, input.styleId, input.audio === true),
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
