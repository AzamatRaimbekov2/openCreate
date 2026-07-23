// apps/web/src/modules/Assets3D/model/webglSupport.test.ts
// The fallback gate is only worth having if it is honest in BOTH directions and
// cannot itself become the failure it exists to prevent. So: it says no in jsdom
// (which is what makes every other Assembly test renderable), it says yes on a
// real context, it never throws, and it HANDS THE PROBE CONTEXT BACK — a probe
// that keeps a context alive spends one of the browser's ~8-16 slots on nothing.
//
// The probe is injected (renderTurntable's TurntableFrameSink precedent) so none
// of this needs a real WebGL context or a cast to fake one.
import { describe, expect, it, vi } from 'vitest'
import { canvasWebGlProbe, isWebGLAvailable } from './webglSupport'
import type { WebGlProbeContext } from './webglSupport'

// A context stub carrying only what the gate touches: the release extension.
function stubContext(loseContext?: () => void): WebGlProbeContext {
  return {
    getExtension: (name) =>
      name === 'WEBGL_lose_context' && loseContext ? { loseContext } : null,
  }
}

describe('canvasWebGlProbe', () => {
  it('finds no context in jsdom', () => {
    // Not a stub: this is the real environment every Vitest run uses, and this
    // null is what makes AssemblyStage render its poster fallback under test.
    expect(canvasWebGlProbe()).toBeNull()
  })
})

describe('isWebGLAvailable', () => {
  it('is false in jsdom, using the real default probe', () => {
    expect(isWebGLAvailable()).toBe(false)
  })

  it('is true when the probe obtains a context', () => {
    expect(isWebGLAvailable(() => stubContext())).toBe(true)
  })

  it('releases the probe context instead of holding a browser slot', () => {
    const loseContext = vi.fn()

    isWebGLAvailable(() => stubContext(loseContext))

    // A probe that leaks a live context on every call is a context-loss BUG in
    // the very gate meant to prevent one.
    expect(loseContext).toHaveBeenCalledOnce()
  })

  it('still reports support when WEBGL_lose_context is missing', () => {
    // The extension is optional. Not having it must not turn a supported browser
    // into an unsupported one — it only means we cannot hand the slot back early.
    expect(isWebGLAvailable(() => stubContext())).toBe(true)
  })

  it('is false instead of throwing when the probe throws', () => {
    // Hardened/embedded browsers and blocked-canvas privacy modes throw here
    // rather than returning null. The gate degrades to the fallback; it never
    // takes the wizard down with it.
    const throwing = () => {
      throw new Error('context creation blocked')
    }

    expect(() => isWebGLAvailable(throwing)).not.toThrow()
    expect(isWebGLAvailable(throwing)).toBe(false)
  })

  it('is true even when releasing the context throws', () => {
    // A driver that fails on loseContext has still proven it can make a context.
    const hostile = (): WebGlProbeContext => ({
      getExtension: () => ({
        loseContext: () => {
          throw new Error('lose failed')
        },
      }),
    })

    expect(isWebGLAvailable(hostile)).toBe(true)
  })
})
