// The portable scene preset (ADR photo-to-3d-studio D4). ONE definition, read by
// BOTH the three.js viewer in the browser AND any future server renderer
// (headless Chromium or Blender). That is what makes the renderer a swappable
// implementation detail instead of an architectural commitment — and what makes
// the preview the user tweaks match the video the user downloads.
//
// FOUR UNIT CONVENTIONS ARE LOAD-BEARING. Break one and the renderers diverge in
// a way no test catches and every user sees:
//
//  1. EXPOSURE IS IN EV (STOPS). Blender's view_settings.exposure is in stops;
//     three's toneMappingExposure is a LINEAR MULTIPLIER. three must compute
//     2 ** exposureEv. Storing the multiplier guarantees a mismatch.
//  2. FOV IS VERTICAL. three's PerspectiveCamera.fov is vertical degrees;
//     Blender's camera.angle is HORIZONTAL by default (sensor_fit AUTO).
//  3. UP-AXIS IS DECLARED. glTF/three are Y-up, Blender is Z-up. The glTF importer
//     fixes the MESH — but the camera path lives HERE and must be converted.
//  4. THE TONE CURVE IS AgX, AND ONLY AgX. three's AgXToneMapping is a deliberate
//     port of Blender's AgX (its 4.0+ default view transform) — the only pair with
//     real parity. three's ACES is a hand-fitted approximation that does not match
//     Blender's. The schema therefore admits no other value: a curve we cannot
//     reproduce on both sides is not a preset, it is a bug waiting to be filed.
import { z } from 'zod'

export const scenePresetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  upAxis: z.literal('Y'),
  environment: z.object({
    // Self-hosted HDRI id (public/hdri/<id>.hdr). NEVER drei's `preset="studio"`:
    // those fetch from a GitHub CDN and drei's own docs say they are not for
    // production.
    hdriId: z.string().min(1),
    // RADIANS — matches three's `environmentRotation` directly. Maps conceptually
    // to Blender's world Mapping node `rotation.z`, but sign/zero-offset differ
    // between the two, so that conversion is a calibration constant that belongs
    // in the Blender exporter, not baked into this preset.
    rotationYRad: z.number(),
    intensity: z.number().positive(),
  }),
  background: z.object({
    mode: z.enum(['color', 'hdri']),
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
  }),
  camera: z.object({
    fovVertical: z.number().positive().max(120),
    // Framing margin as a % of the model's bounding sphere. Deterministic framing
    // (compute the Box3, derive the camera distance) rather than drei's <Bounds>,
    // because the exact same math has to run in whatever renders the final video.
    marginPct: z.number().min(0).max(100),
    orbit: z.object({
      // Deliberately unbounded and cyclic, NOT clamped to [0, 360): the
      // `dramatic` preset spans -30 -> 330 to center its sweep on the front of
      // the model. Clamping these to a 0-360 range would silently change which
      // arc the camera travels.
      azimuthStartDeg: z.number(),
      azimuthEndDeg: z.number(),
      elevationDeg: z.number().min(-89).max(89),
      // Camera distance = boundingSphere.radius * radiusFactor.
      radiusFactor: z.number().positive(),
    }),
  }),
  tonemap: z.object({
    curve: z.literal('agx'),
    exposureEv: z.number().min(-4).max(4),
  }),
  floor: z.object({
    enabled: z.boolean(),
    opacity: z.number().min(0).max(1),
    softness: z.number().min(0).max(1),
  }),
  render: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    fps: z.number().int().min(12).max(60),
    durationSec: z.number().min(1).max(20),
  }),
})
export type ScenePreset = z.infer<typeof scenePresetSchema>

const base = {
  upAxis: 'Y',
  tonemap: { curve: 'agx', exposureEv: 0 },
  render: { width: 1920, height: 1080, fps: 30, durationSec: 6 },
} as const

// Presets are SERVER-OWNED and named: the client sends a token, never a lighting
// rig. That keeps the render reproducible and stops the preset surface from
// becoming an unbounded API.
export const SCENE_PRESETS: ScenePreset[] = [
  {
    ...base,
    id: 'studio',
    name: 'Studio',
    environment: { hdriId: 'studio-soft', rotationYRad: 0.35, intensity: 1.0 },
    background: { mode: 'color', color: '#0b0b0d' },
    camera: {
      fovVertical: 35,
      marginPct: 12,
      orbit: { azimuthStartDeg: 0, azimuthEndDeg: 360, elevationDeg: 12, radiusFactor: 2.6 },
    },
    floor: { enabled: true, opacity: 0.7, softness: 0.6 },
  },
  {
    ...base,
    id: 'product',
    name: 'Product',
    environment: { hdriId: 'studio-soft', rotationYRad: 0, intensity: 1.3 },
    background: { mode: 'color', color: '#f5f5f7' },
    camera: {
      fovVertical: 28,
      marginPct: 18,
      orbit: { azimuthStartDeg: 0, azimuthEndDeg: 360, elevationDeg: 8, radiusFactor: 3.0 },
    },
    floor: { enabled: true, opacity: 0.35, softness: 0.8 },
  },
  {
    ...base,
    id: 'dramatic',
    name: 'Dramatic',
    environment: { hdriId: 'rim-hard', rotationYRad: 2.1, intensity: 0.8 },
    background: { mode: 'color', color: '#050507' },
    camera: {
      fovVertical: 42,
      marginPct: 6,
      orbit: { azimuthStartDeg: -30, azimuthEndDeg: 330, elevationDeg: 22, radiusFactor: 2.3 },
    },
    floor: { enabled: true, opacity: 0.9, softness: 0.3 },
    tonemap: { curve: 'agx', exposureEv: -0.5 },
  },
  {
    ...base,
    id: 'neon',
    name: 'Neon',
    environment: { hdriId: 'neon-city', rotationYRad: 1.2, intensity: 1.6 },
    background: { mode: 'hdri', color: '#12021f' },
    camera: {
      fovVertical: 38,
      marginPct: 10,
      orbit: { azimuthStartDeg: 0, azimuthEndDeg: 360, elevationDeg: 5, radiusFactor: 2.5 },
    },
    floor: { enabled: false, opacity: 0, softness: 0 },
    tonemap: { curve: 'agx', exposureEv: 0.3 },
  },
]

export function getScenePreset(id: string): ScenePreset | undefined {
  return SCENE_PRESETS.find((p) => p.id === id)
}
