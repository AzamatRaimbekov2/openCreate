// packages/contracts/src/presets.ts
// The CinemaStudio prompt-preset tables + the pure function that composes them
// into the positive/negative prompt a model sees.
//
// ADR: docs/wiki/decisions/cinema-studio.md (§3 "a preset is structure, never prose").
//
// WHY THIS LIVES IN CONTRACTS (same argument as resolution.ts):
// A preset is a NAMED choice, not free text. The web renders the style/camera
// pickers from these tables; the API composes the final prompt from the SAME
// tables. If the client concatenated the fragments itself and sent the result
// as `prompt`, the stored prompt would be fragment soup — "Regenerate" and
// "Edit prompt" would show the user 300 characters they never wrote, changing a
// fragment would need a new SPA build, and the row could never answer "which
// style was this?". So the client sends the structured ids; the server composes.
//
// The tables are pure data; applyPromptPreset is a pure function. Both sit on
// the wire boundary next to the catalog/resolution schemas they travel with.
import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// Style — the big visual identity. The ONE preset that also carries a negative
// prompt (a Disney render must actively push away "photorealistic, live action")
// and a recommended model (the seam through which a LoRA-backed style could
// later swap the model — see the ADR's rejected-alternatives note).
// ─────────────────────────────────────────────────────────────────────────────
export const styleIdSchema = z.enum(['disney', 'anime', '2d-cartoon', '3d-cartoon', 'cinematic'])
export type StyleId = z.infer<typeof styleIdSchema>

export type StylePreset = {
  id: StyleId
  // Human label for the picker (single source: web reads it, API ignores it).
  label: string
  // Prepended to the model prompt.
  fragment: string
  // Pushed into the negative prompt so the style is enforced, not merely hinted.
  negative: string
  // The catalog model this style renders best on. Advisory — the composer may
  // default the model picker to it; the API never forces it.
  recommendedModelId: string
}

// Keyed as a literal object (not Record<StyleId,…>) so noUncheckedIndexedAccess
// keeps STYLE_PRESETS.disney fully defined without a guard.
export const STYLE_PRESETS = {
  disney: {
    id: 'disney',
    label: 'Disney',
    fragment:
      '3D animated feature film style, Disney/Pixar aesthetic, expressive characters, soft global illumination, warm cinematic color grading',
    negative: 'photorealistic, live action, gritty, low quality',
    recommendedModelId: 'wan-2-7',
  },
  anime: {
    id: 'anime',
    label: 'Аниме',
    fragment:
      'anime style, cel-shaded, clean line art, vibrant saturated colors, detailed backgrounds, Japanese animation aesthetic',
    negative: 'photorealistic, 3d render, western cartoon, low quality',
    recommendedModelId: 'wan-2-7',
  },
  '2d-cartoon': {
    id: '2d-cartoon',
    label: '2D мультфильм',
    fragment:
      '2D cartoon style, flat bold colors, thick outlines, simple shapes, playful hand-drawn animation look',
    negative: 'photorealistic, 3d render, realistic shading, low quality',
    recommendedModelId: 'pixverse-v6',
  },
  '3d-cartoon': {
    id: '3d-cartoon',
    label: '3D мультфильм',
    fragment:
      '3D cartoon style, stylized characters, rounded soft geometry, bright playful lighting, family animation look',
    negative: 'photorealistic, live action, gritty, low quality',
    recommendedModelId: 'wan-2-7',
  },
  cinematic: {
    id: 'cinematic',
    label: 'Кино',
    fragment:
      'cinematic live-action style, photorealistic, dramatic lighting, shallow depth of field, film grain, professional color grading',
    negative: 'cartoon, anime, illustration, low quality, deformed',
    recommendedModelId: 'seedance-1-5-pro',
  },
} satisfies Record<StyleId, StylePreset>

// ─────────────────────────────────────────────────────────────────────────────
// The three "modifier" axes. Each is a small id→fragment table with the same
// shape — no negative, no recommended model, just a phrase folded into the
// positive prompt in a fixed order. 'none' is a real, first-class value so the
// composer can offer "no preference" without special-casing undefined.
// ─────────────────────────────────────────────────────────────────────────────
export type PresetOption = { id: string; label: string; fragment: string }

export const cameraShotSchema = z.enum([
  'none',
  'wide',
  'medium',
  'close-up',
  'extreme-close-up',
  'aerial',
  'low-angle',
])
export type CameraShot = z.infer<typeof cameraShotSchema>

export const CAMERA_SHOTS = {
  none: { id: 'none', label: 'Любой план', fragment: '' },
  wide: { id: 'wide', label: 'Общий план', fragment: 'wide establishing shot' },
  medium: { id: 'medium', label: 'Средний план', fragment: 'medium shot' },
  'close-up': { id: 'close-up', label: 'Крупный план', fragment: 'close-up shot' },
  'extreme-close-up': {
    id: 'extreme-close-up',
    label: 'Деталь',
    fragment: 'extreme close-up, macro detail',
  },
  aerial: { id: 'aerial', label: 'С высоты', fragment: 'aerial drone shot, bird’s-eye view' },
  'low-angle': { id: 'low-angle', label: 'Нижний ракурс', fragment: 'dramatic low-angle shot' },
} satisfies Record<CameraShot, PresetOption>

export const cameraMotionSchema = z.enum([
  'none',
  'static',
  'dolly-in',
  'dolly-out',
  'pan',
  'orbit',
  'handheld',
  'crane',
])
export type CameraMotion = z.infer<typeof cameraMotionSchema>

export const CAMERA_MOTIONS = {
  none: { id: 'none', label: 'Любое движение', fragment: '' },
  static: { id: 'static', label: 'Статика', fragment: 'static locked-off camera' },
  'dolly-in': { id: 'dolly-in', label: 'Наезд', fragment: 'slow dolly in' },
  'dolly-out': { id: 'dolly-out', label: 'Отъезд', fragment: 'slow dolly out' },
  pan: { id: 'pan', label: 'Панорама', fragment: 'smooth camera pan' },
  orbit: { id: 'orbit', label: 'Облёт', fragment: 'orbiting camera move' },
  handheld: { id: 'handheld', label: 'С рук', fragment: 'handheld camera, subtle shake' },
  crane: { id: 'crane', label: 'Кран', fragment: 'sweeping crane shot' },
} satisfies Record<CameraMotion, PresetOption>

export const qualitySchema = z.enum(['none', 'draft', 'standard', 'cinematic', 'ultra'])
export type Quality = z.infer<typeof qualitySchema>

export const QUALITY_PRESETS = {
  none: { id: 'none', label: 'По умолчанию', fragment: '' },
  draft: { id: 'draft', label: 'Черновик', fragment: 'simple, quick sketch quality' },
  standard: { id: 'standard', label: 'Стандарт', fragment: 'high quality, detailed' },
  cinematic: {
    id: 'cinematic',
    label: 'Кинокачество',
    fragment: 'cinematic quality, highly detailed, sharp focus, professional lighting',
  },
  ultra: {
    id: 'ultra',
    label: 'Максимум',
    fragment: 'ultra detailed, 8k, masterpiece, best quality, intricate detail',
  },
} satisfies Record<Quality, PresetOption>

// ─────────────────────────────────────────────────────────────────────────────
// The wire shape. Every field optional and additive: a request with NO
// promptPreset composes to exactly the user's prompt, so the existing
// ChatComposer keeps working untouched.
// ─────────────────────────────────────────────────────────────────────────────
export const promptPresetSchema = z.object({
  styleId: styleIdSchema.optional(),
  cameraShot: cameraShotSchema.optional(),
  cameraMotion: cameraMotionSchema.optional(),
  quality: qualitySchema.optional(),
})
export type PromptPreset = z.infer<typeof promptPresetSchema>

export type ComposedPrompt = { positivePrompt: string; negativePrompt: string }

// Compose the model-facing prompt from the user's text + the structured preset.
//
// Order (fixed, so a stored composedPrompt is reproducible): style, shot,
// motion, quality, then the user's own text LAST so it carries the semantic
// weight. Empty fragments ('none' options, or an unset field) contribute
// nothing — no dangling commas. The negative prompt is the style's negative
// (the only axis that has one). An unknown id (should be impossible past zod,
// but this is the correctness core) is treated as absent, never as a literal.
export function applyPromptPreset(userPrompt: string, preset?: PromptPreset): ComposedPrompt {
  const fragments: string[] = []
  let negativePrompt = ''

  if (preset?.styleId) {
    const style = STYLE_PRESETS[preset.styleId]
    if (style) {
      fragments.push(style.fragment)
      negativePrompt = style.negative
    }
  }
  if (preset?.cameraShot) {
    const shot = CAMERA_SHOTS[preset.cameraShot]
    if (shot?.fragment) fragments.push(shot.fragment)
  }
  if (preset?.cameraMotion) {
    const motion = CAMERA_MOTIONS[preset.cameraMotion]
    if (motion?.fragment) fragments.push(motion.fragment)
  }
  if (preset?.quality) {
    const quality = QUALITY_PRESETS[preset.quality]
    if (quality?.fragment) fragments.push(quality.fragment)
  }

  const trimmed = userPrompt.trim()
  if (trimmed) fragments.push(trimmed)

  return { positivePrompt: fragments.join(', '), negativePrompt }
}
