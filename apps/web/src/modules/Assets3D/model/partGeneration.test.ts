// apps/web/src/modules/Assets3D/model/partGeneration.test.ts
// The poll-stop guards, proved pure — no WebGL, no network, no QueryClient. The
// hook wires partPollInterval into refetchInterval; the decision itself is what
// must never regress (a stuck interval hammers the API; a premature stop leaves a
// card spinning forever).
import { describe, expect, it } from 'vitest'
import type { Generation } from '@opencreate/contracts'
import { GENERATION_POLL_MS, partPollInterval } from './partGeneration'

function gen(status: Generation['status']): Generation {
  return {
    id: 'g1',
    type: 'model3d',
    mode: 'image',
    status,
    prompt: '',
    modelId: 'trellis-2',
    params: { aspectRatio: '1:1' },
    costCredits: 6,
    mediaUrls: [],
    errorMessage: null,
    createdAt: '2026-07-18T10:00:00.000Z',
    completedAt: null,
  }
}

describe('partPollInterval', () => {
  it('keeps polling while the answer is processing', () => {
    expect(partPollInterval(false, gen('processing'))).toBe(GENERATION_POLL_MS)
  })
  it('stops on a terminal answer', () => {
    expect(partPollInterval(false, gen('succeeded'))).toBe(false)
    expect(partPollInterval(false, gen('failed'))).toBe(false)
  })
  it('stops on a first-poll error (no data yet) instead of hammering', () => {
    expect(partPollInterval(true, undefined)).toBe(false)
  })
  it('keeps polling through a blip once processing data exists', () => {
    // A failure AFTER data must not kill a live view that already has a processing answer
    expect(partPollInterval(true, gen('processing'))).toBe(GENERATION_POLL_MS)
  })
  it('does not poll before any data has loaded', () => {
    expect(partPollInterval(false, undefined)).toBe(false)
  })
})
