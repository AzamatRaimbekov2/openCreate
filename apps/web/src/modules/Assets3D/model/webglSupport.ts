// apps/web/src/modules/Assets3D/model/webglSupport.ts
// The no-WebGL fallback gate for the assembly viewer (ADR photo-to-3d-studio D6,
// applied verbatim by modular-3d-assets D4).
//
// WHY THIS EXISTS AT ALL: the assembly stage mounts a real <Canvas> holding up to
// MAX_PARTS GLBs. On a machine with no WebGL — a locked-down browser, a blocklisted
// GPU, a crawler, a privacy mode that stubs canvas — R3F throws on mount and takes
// the wizard with it. Asking FIRST turns that crash into the poster grid the ADR
// specifies. It is also what makes the assembly stage unit-testable: in jsdom this
// returns false, so tests exercise the fallback and never touch real WebGL.
//
// The probe is a PORT, for the same reason renderTurntable's frame sink is one —
// jsdom has no WebCodecs, and it has no WebGL either. Injecting it lets every
// branch below be tested without a GPU and without casting a fake context.

// The single slice of a WebGL context this gate touches. Both WebGLRenderingContext
// and WebGL2RenderingContext satisfy it structurally.
export type WebGlProbeContext = {
  getExtension: (name: string) => unknown
}

// Returns a context if one can be made, else null. Must not throw for the caller.
export type WebGlProbe = () => WebGlProbeContext | null

// WEBGL_lose_context is optional, so its shape arrives as `unknown` and is narrowed
// rather than asserted.
function isLoseContextExtension(ext: unknown): ext is { loseContext: () => void } {
  return (
    typeof ext === 'object' &&
    ext !== null &&
    'loseContext' in ext &&
    typeof ext.loseContext === 'function'
  )
}

// The real probe: a throwaway <canvas>, webgl2 first (what R3F prefers) then webgl1.
// Never reused and never mounted — it exists for the length of one question.
export const canvasWebGlProbe: WebGlProbe = () => {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  return canvas.getContext('webgl2') ?? canvas.getContext('webgl')
}

// True when this browser can actually render the assembly viewer.
//
// The probe context is RELEASED before returning. That is not tidiness: browsers cap
// live WebGL contexts at roughly 8-16, and silently kill the OLDEST one past the cap.
// A gate that kept its probe alive on every call would evict the viewer's own canvas —
// the exact context loss this function exists to avoid.
export function isWebGLAvailable(probe: WebGlProbe = canvasWebGlProbe): boolean {
  let context: WebGlProbeContext | null
  try {
    context = probe()
  } catch {
    // Blocked-canvas privacy modes and hardened builds throw instead of returning
    // null. Unsupported is the honest answer; crashing is not.
    return false
  }
  if (context === null) return false

  try {
    const lose = context.getExtension('WEBGL_lose_context')
    if (isLoseContextExtension(lose)) lose.loseContext()
  } catch {
    // The extension is optional and a driver may fail on it. The context was still
    // created, so support is proven — we just could not hand the slot back early.
  }
  return true
}
