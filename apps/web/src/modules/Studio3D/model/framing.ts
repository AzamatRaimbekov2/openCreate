// The camera math a scene preset implies. PURE on purpose: the same function has to
// run in whatever renders the final video (ADR D4 — one preset, N renderers), and a
// framing bug is invisible in code review but obvious in every frame.
//
// Y-UP throughout, matching glTF/three (preset.upAxis === 'Y'). A Blender exporter
// reads upAxis and rotates -90° about X; it does NOT get to reinterpret these numbers.
import type { ScenePreset } from '@opencreate/contracts'

export type Bounds = { center: [number, number, number]; radius: number }
type Orbit = ScenePreset['camera']['orbit']

// Azimuth at normalized time t ∈ [0,1], linearly interpolated start -> end.
// Deliberately unbounded and cyclic (not clamped to [0, 360)): the 'dramatic'
// preset sweeps -30 -> 330 and a clamp would silently change which arc it travels.
export function orbitAzimuthAt(orbit: Orbit, t: number): number {
  return orbit.azimuthStartDeg + (orbit.azimuthEndDeg - orbit.azimuthStartDeg) * t
}

// Position at normalized time t ∈ [0,1]. Distance is radius * radiusFactor, so the
// framing is scale-invariant: a 2cm ring and a 3m sofa both fill the same fraction of
// the frame, which is what makes one preset work for every model a user uploads.
export function cameraPositionAt(orbit: Orbit, bounds: Bounds, t: number): [number, number, number] {
  const azimuth = (orbitAzimuthAt(orbit, t) * Math.PI) / 180
  const elevation = (orbit.elevationDeg * Math.PI) / 180
  const distance = bounds.radius * orbit.radiusFactor
  const horizontal = distance * Math.cos(elevation)
  const [cx, cy, cz] = bounds.center
  return [
    cx + horizontal * Math.sin(azimuth),
    cy + distance * Math.sin(elevation),
    // Offset from the model's CENTRE, not the origin: provider meshes are not
    // reliably centred, and framing from the origin puts half of them out of shot.
    cz + horizontal * Math.cos(azimuth),
  ]
}
