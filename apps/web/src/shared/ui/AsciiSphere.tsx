// apps/web/src/shared/ui/AsciiSphere.tsx
// The v3 hero visual: a dependency-free animated ASCII ellipsoid drawn on a
// <canvas> 2d context (NO WebGL, NO libraries, NO gradients — flat mist-colored
// glyphs at low opacity on a transparent background). A character grid samples
// an ellipsoid surface; brightness = lambert shading × slowly rotating meridian
// bands, mapped onto an ASCII density ramp. ~30fps via a frame-capped rAF loop
// with full cleanup; prefers-reduced-motion renders ONE static frame instead.
// Decorative only (aria-hidden) — the hero copy on top carries all meaning.
import { useEffect, useRef } from 'react'

export type AsciiSphereProps = {
  // Sizing/placement utilities from the caller (e.g. "absolute inset-0") —
  // the canvas fills whatever box it is given and draws the sphere centered
  className?: string
}

// Density ramp, sparse → dense: shade 0..1 picks the glyph. The leading space
// keeps the darkest cells empty so the sphere dissolves into the void.
const RAMP = ' .:-=+*#%@'
// Character cell size in CSS px — airy grid so the low-opacity field stays quiet
const CELL_W = 11
const CELL_H = 20
// ~30fps budget: rAF fires at display rate, frames inside the budget are skipped
const FRAME_MS = 33
// Rotation speed in rad/ms — a slow, watchable drift
const SPIN = 0.00035
// Fixed light direction (unit vector), upper-left front — matches the surface
// ladder's "light comes from the reader" feel
const LIGHT_X = -0.42
const LIGHT_Y = -0.55
const LIGHT_Z = 0.72
// Mist token fallback for non-CSS contexts (tests, canvas-only environments) —
// mirrors --color-mist; the live value is resolved from the theme at mount
const MIST_FALLBACK = '#cad5e2'

// One full ASCII frame at rotation time `t` (ms). Pure draw: no state.
function drawFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  t: number,
  color: string,
): void {
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = color
  // "Low opacity" per the design law — the sphere is atmosphere, not content
  ctx.globalAlpha = 0.34
  ctx.font = "13px 'JetBrains Mono', ui-monospace, monospace"
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // Ellipsoid radii: wider than tall (the reference sphere is an ellipsoid),
  // capped so it always fits the box with breathing room
  const ry = height * 0.36
  const rx = Math.min(width * 0.42, ry * 1.5)
  const cx = width / 2
  const cy = height / 2
  const spin = t * SPIN

  for (let py = CELL_H / 2; py < height; py += CELL_H) {
    for (let px = CELL_W / 2; px < width; px += CELL_W) {
      // Normalized coordinates on the ellipse cross-section
      const x = (px - cx) / rx
      const y = (py - cy) / ry
      const d2 = x * x + y * y
      if (d2 > 1) continue
      // Depth of the visible hemisphere at this cell; (x, y, z) doubles as the
      // unit-sphere normal for the lambert term
      const z = Math.sqrt(1 - d2)
      const lambert = Math.max(0, x * LIGHT_X + y * LIGHT_Y + z * LIGHT_Z)
      // Rotating meridian bands make the spin visible (pure lambert shading is
      // rotation-invariant on a sphere): longitude drifts with time, latitude
      // bends the bands so they read as a surface, not stripes
      const longitude = Math.atan2(z, x) + spin
      const latitude = Math.asin(Math.max(-1, Math.min(1, y)))
      const bands = 0.5 + 0.5 * Math.sin(longitude * 5 + Math.sin(latitude * 3) * 1.2)
      const shade = lambert * (0.45 + 0.55 * bands)
      // charAt never returns undefined (unlike indexing under
      // noUncheckedIndexedAccess); the darkest cells map to the space glyph
      const glyph = RAMP.charAt(Math.min(RAMP.length - 1, Math.floor(shade * RAMP.length)))
      if (glyph === ' ') continue
      ctx.fillText(glyph, px, py)
    }
  }
}

export function AsciiSphere({ className = '' }: AsciiSphereProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    // No 2d surface (unsupported/jsdom): stay an inert transparent box
    if (!ctx) return

    // Resolve the mist token from the live theme so the canvas glyphs stay in
    // sync with theme.css; the fallback mirrors the token for non-CSS contexts
    const mist = getComputedStyle(canvas).getPropertyValue('--color-mist').trim() || MIST_FALLBACK

    // Reduced motion: honored with a static frame, never a paused loop
    const prefersReducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // CSS size of the drawing surface — updated on resize
    let width = 0
    let height = 0

    // Match the backing store to the CSS box at device resolution so the
    // glyphs stay crisp on retina displays
    function resize(): void {
      if (!canvas || !ctx) return
      width = canvas.clientWidth
      height = canvas.clientHeight
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.max(1, Math.round(width * dpr))
      canvas.height = Math.max(1, Math.round(height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    // Fixed rotation for the static (reduced-motion / first) frame — chosen so
    // the bands sit asymmetrically instead of a dead-center mirror pose
    const staticT = 2600

    resize()
    // Paint immediately — the hero must never flash an empty canvas
    drawFrame(ctx, width, height, staticT, mist)

    // Redraw after a resize so the sphere re-centers (static pose is fine
    // here; the next animation tick takes over when motion is allowed)
    function handleResize(): void {
      if (!ctx) return
      resize()
      drawFrame(ctx, width, height, staticT, mist)
    }
    window.addEventListener('resize', handleResize)

    if (prefersReducedMotion) {
      return () => {
        window.removeEventListener('resize', handleResize)
      }
    }

    // ~30fps loop: rAF drives it, the FRAME_MS budget drops excess frames
    let rafId = 0
    let lastFrameAt = 0
    function tick(now: number): void {
      rafId = window.requestAnimationFrame(tick)
      if (now - lastFrameAt < FRAME_MS) return
      lastFrameAt = now
      if (!ctx) return
      drawFrame(ctx, width, height, now, mist)
    }
    rafId = window.requestAnimationFrame(tick)

    return () => {
      window.cancelAnimationFrame(rafId)
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  // Decorative: hidden from the accessibility tree; pointer-events stay with
  // the hero content above (callers overlay copy on top of the canvas)
  return <canvas ref={canvasRef} aria-hidden="true" className={`block ${className}`} />
}
