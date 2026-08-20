// framesForDuration (src/integrations/runpod/wan22-t2v-workflow.ts) has no test
// anywhere in the suite — comfy-client.test.ts injects its own workflow fixture
// and never imports it. It is a pure function but it is also a MONEY/CORRECTNESS
// boundary: comfy-client.ts feeds its result straight into the ComfyUI latent
// `length` input, so an off-by-one here silently renders the wrong clip duration.
import { describe, expect, it } from 'vitest'
import { framesForDuration, WAN_FPS } from '../src/integrations/runpod/wan22-t2v-workflow'

describe('framesForDuration', () => {
  it('converts whole seconds at 16fps plus the leading keyframe', () => {
    expect(framesForDuration(5)).toBe(81)
  })

  it('matches WAN_FPS rather than a hardcoded literal', () => {
    expect(framesForDuration(1)).toBe(WAN_FPS + 1)
  })

  it('returns 1 (just the keyframe) for a zero-second duration', () => {
    expect(framesForDuration(0)).toBe(1)
  })
})
