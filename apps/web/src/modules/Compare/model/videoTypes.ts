// apps/web/src/modules/Compare/model/videoTypes.ts
// Panel-level types for the hidden /compare-video cost page.
//
// WHY THIS IS A SEPARATE SHAPE FROM types.ts. The image page compares three
// MODELS and its interesting axis is what the picture looks like. This page
// compares two CHANNELS carrying the SAME model, and its interesting axis is the
// receipt — so a panel here carries money provenance (the provider's own USD, and
// kie.ai's raw credit count so the conversion can be checked) that the image
// panel has no concept of. Sharing one type would force every field to be
// optional and both pages would lose their guarantees.
import type { ApiErrorCode, CompareVideoPanel } from '@opencreate/contracts'

// The pipes, in on-screen order — cheapest surveyed rate first. `segmind` leads
// because it holds a FLAT $7.00/M on every resolution, where DeepInfra bills a
// measured $7.70/M even at 720p; the page exists to find out whether that published
// advantage survives contact with a real invoice.
export type VideoChannelId = 'segmind' | 'deepinfra' | 'kie'

export type VideoRunStatus = 'empty' | 'loading' | 'error' | 'success'

// The whole run, not one panel: the API settles BOTH channels in a single
// response, so there is no state where one panel has data and the other is still
// loading. Modelling it per-panel would invent a state the server cannot produce.
export type VideoRunState =
  | { status: 'empty' }
  | { status: 'loading' }
  // A run-level failure (auth, validation, rate limit, network) — distinct from a
  // channel failure, which arrives INSIDE a successful response as an error panel.
  //
  // Carries a CODE, not a message: the page renders it through the shared
  // `errorCodeMessageKey` → i18n layer, so no server prose reaches the screen. Null
  // covers a network failure that never produced an envelope.
  | { status: 'error'; errorCode: ApiErrorCode | null }
  | {
      status: 'success'
      prompt: string
      durationSeconds: number
      resolution: string
      panels: CompareVideoPanel[]
    }

export type { CompareVideoPanel }
