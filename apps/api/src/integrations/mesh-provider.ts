// The Mesh3dProvider seam (ADR: photo-to-3d-studio D2), shaped exactly like the
// VideoProvider seam next door: the generation lifecycle performs exactly two
// provider operations on a 3D job — submit it, then poll it — so the abstraction
// is those two calls and nothing more.
//
// The poll result is the VideoPollResult union VERBATIM (a type alias, not a
// copy). That is the whole point: the service switches on the SAME neutral union
// it already switches on, so every money-path invariant (charge-at-submit,
// refund-once, the no-asset guard, the stale reaper, the poll throttle) applies
// to 3D with ZERO new money code. Duplicating the union here would let the two
// drift and quietly fork the refund path — if you are tempted, don't.
import type { Mesh3dProviderId } from '@opencreate/contracts'
import type { VideoPollResult } from './video-provider'

export type { Mesh3dProviderId }

// Deliberately an ALIAS, not a redefinition. See the header.
export type MeshPollResult = VideoPollResult

// What the service hands a 3D provider at submit time. Provider-neutral: no
// aspect ratio and no duration (a mesh has neither), just the photo and the
// quality knobs. Optionals are `| undefined` because the repo compiles with
// exactOptionalPropertyTypes and callers build these from optional catalog fields.
export type Mesh3dSubmitInput = {
  // Runware requires the CALLER to mint the task id; it doubles as the idempotency
  // key for the client's single bounded retry, which is why it is an input rather
  // than something the adapter generates. A self-host adapter (comfy-3d) that
  // mints its own handle simply ignores this and returns its own in providerJobId.
  taskUUID: string
  // Backend model handle. For Runware this is the AIR id (e.g. TRELLIS.2).
  model: string
  // The user's photo, as a data URI. Never a URL: the API does not hand a provider
  // a user-supplied host to fetch, and the SSRF gate exists for exactly this.
  inputImage: string
  // Quality knobs. Runware's returned `cost` SCALES WITH THESE, which is why the
  // settled row bills from the poll response's costUsd and never from a list price.
  pbr?: boolean | undefined
  faceLimit?: number | undefined
}

// The whole seam: submit returns an opaque provider job id the service persists
// and later polls with. Two operations, mirroring the two the lifecycle runs.
export type Mesh3dProvider = {
  submit(input: Mesh3dSubmitInput): Promise<{ providerJobId: string }>
  poll(providerJobId: string): Promise<MeshPollResult>
}
