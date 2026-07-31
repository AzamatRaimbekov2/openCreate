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
//
// TWO IDS, ONE AXIS (ADR style-studio D1). Since users build their own styles,
// the WIRE id is an open string that the SERVER resolves at use time against a
// registry of two sources — these builtins, and the caller's own `style` rows —
// exactly the way `modelId` is resolved against the catalog rather than pinned
// by an enum. The enum below survives as the type of THIS table's keys: the
// seven builtin ids are immutable (every existing film, shot and template holds
// one), and anything that indexes STYLE_PRESETS must still be exhaustive.
//
// Which of the two a consumer wants is a real decision, not a formality:
//   · wire/user-chosen surface (promptPreset.styleId, film.defaultStyleId,
//     storyboard input) → `styleIdSchema`, because a user style is legal there;
//   · fixed internal catalog (STYLE_PRESETS itself, the server-side template
//     catalog, a soul's style axis) → `builtinStyleIdSchema`, because those are
//     authored in code against these seven and index the table directly.
// ─────────────────────────────────────────────────────────────────────────────
export const builtinStyleIdSchema = z.enum([
  'disney',
  'anime',
  '2d-cartoon',
  '3d-cartoon',
  'hand-drawn',
  'comic',
  'cinematic',
])
export type BuiltinStyleId = z.infer<typeof builtinStyleIdSchema>

// The wire id. Open, and deliberately keeping the old export NAME so every
// consumer for which "any resolvable style" was always the honest meaning keeps
// compiling untouched. Widening only: all seven builtin ids still parse, so no
// stored row and no client build becomes invalid. 60 chars fits a uuid with
// room to spare; the server rejects anything it cannot resolve, before charging.
export const styleIdSchema = z.string().min(1).max(60)
export type StyleId = z.infer<typeof styleIdSchema>

export type StylePreset = {
  id: BuiltinStyleId
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
    recommendedModelId: 'pixverse-v6',
  },
  anime: {
    id: 'anime',
    label: 'Аниме',
    fragment:
      'anime style, cel-shaded, clean line art, vibrant saturated colors, detailed backgrounds, Japanese animation aesthetic',
    negative: 'photorealistic, 3d render, western cartoon, low quality',
    recommendedModelId: 'pixverse-v6',
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
    recommendedModelId: 'pixverse-v6',
  },
  // The authored-animation style, extracted from the «Буран» template's reference
  // prompt (apps/api/src/modules/templates/catalog/buran.ts). It is NOT a second
  // '2d-cartoon': that one is flat, bold and playful (Saturday-morning TV). This
  // one is an animated FEATURE — painted, hand-made, deliberately unsmooth.
  //
  // THE ONE IDEA THIS FRAGMENT ENCODES: "animated on twos". A drawing is held for
  // two frames, then replaced — 12 real drawings a second, stepped pose-to-pose,
  // with no interpolation between them. Video models default to buttery
  // frame-interpolated motion (they are trained on live action), so the cadence
  // has to be demanded in the positive prompt AND actively pushed away in the
  // negative one. Without "no smooth in-between interpolation" in `fragment` and
  // "smooth interpolated motion, motion blur" in `negative`, the model renders a
  // 2D-looking picture moving like a 3D render — which is the exact uncanny
  // failure this style exists to prevent.
  //
  // WHAT IS DELIBERATELY *NOT* HERE: light and camera. The reference prompt also
  // pins a lightless night blizzard and a handheld operator — but those belong to
  // the SCENE, not the technique. Lighting stays in the shot's own prompt; camera
  // is its own preset axis (cameraMotion: 'handheld'). Keeping this fragment to
  // the drawing technique alone is what makes the style reusable for a sunlit
  // hand-drawn film instead of only for a snowstorm.
  'hand-drawn': {
    id: 'hand-drawn',
    label: 'Рисованная (на двойках)',
    fragment:
      'traditional hand-drawn 2D animation, animated on twos at 12 frames per second, each drawing held for two frames then replaced, choppy stepped pose-to-pose motion cadence with distinct keyframe drawings and no smooth in-between interpolation, hand-painted oil-brush texture on every drawing, brushstrokes shifting and redrawn from frame to frame, visible line jitter and boil between frames, flat painted colour shapes with no gradient shading',
    negative:
      '3d render, CGI, game engine, photorealistic, live action, smooth interpolated motion, motion blur, gradient shading, glossy highlights, low quality',
    // Cinema (wan-2-7) holds a painted look across 8 seconds better than the
    // cheaper models do. Advisory only — the template's tier still picks the model.
    recommendedModelId: 'wan-2-7',
  },
  // Western comic book — added for Soul Studio (the owner asked for comics by
  // name). It is NOT '2d-cartoon': that one is flat, soft and playful. This one
  // is INKED — hard black linework, halftone dots, cel colour inside the lines.
  // The negative carries the two things a diffusion model reaches for when it
  // hears "comic" and gets it wrong: a soft painterly render (no ink at all) and
  // an anime face (the other illustrated tradition it has far more training data
  // for). Both are pushed away explicitly, or "comic" quietly renders as "anime".
  comic: {
    id: 'comic',
    label: 'Комикс',
    fragment:
      'western comic book art style, bold black ink outlines, heavy cross-hatching, halftone dot shading, flat saturated cel colors, dynamic graphic novel illustration',
    negative: 'photorealistic, 3d render, anime, soft painterly render, blurry lines, low quality',
    recommendedModelId: 'pixverse-v6',
  },
  cinematic: {
    id: 'cinematic',
    label: 'Кино',
    fragment:
      'cinematic live-action style, photorealistic, dramatic lighting, shallow depth of field, film grain, professional color grading',
    negative: 'cartoon, anime, illustration, low quality, deformed',
    recommendedModelId: 'seedance-1-5-pro',
  },
} satisfies Record<BuiltinStyleId, StylePreset>

// The builtin half of the style registry, as a lookup (ADR style-studio D1).
// Callers hand the result straight to applyPromptPreset; `null` means "not a
// builtin id", which the server then tries to resolve as one of the caller's
// own style rows — and refuses if that misses too.
//
// It returns the WHOLE preset rather than just the two fragments the composer
// needs, because the other two readers of a resolved builtin want the rest of
// it: the registry's list endpoint needs `label`, and the Cinema inspector
// needs `recommendedModelId` to default its model picker. A StylePreset already
// satisfies StyleFragments structurally, so one lookup serves all three instead
// of three near-identical ones.
export function resolveBuiltinStyle(id: string): StylePreset | null {
  return Object.hasOwn(STYLE_PRESETS, id)
    ? STYLE_PRESETS[id as BuiltinStyleId]
    : null
}

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
// Framing — the SECOND axis to carry a negative prompt (style was the first).
//
// It exists because Soul Studio's whole promise is a reference sheet that is
// "clean and unambiguous": one character, plain background, even light, nothing
// else in frame. That is not a phrase you can bolt onto a prompt and hope — a
// diffusion model, left alone, will happily put the character in a forest, add a
// second figure, and stamp a signature in the corner. Half the work is in the
// NEGATIVE (busy background, multiple characters, text, watermark, cropped), and
// a positive-only axis (PresetOption) cannot express that.
//
// Making it a NAMED axis rather than a magic string in the API means the phrase
// is testable, tunable without a schema change, and reusable by CinemaStudio
// (a clean product shot wants exactly the same thing).
// ─────────────────────────────────────────────────────────────────────────────
export type NegatingPresetOption = PresetOption & { negative: string }

export const framingSchema = z.enum(['none', 'reference-sheet'])
export type Framing = z.infer<typeof framingSchema>

export const FRAMING_PRESETS = {
  none: { id: 'none', label: 'Любой кадр', fragment: '', negative: '' },
  'reference-sheet': {
    id: 'reference-sheet',
    label: 'Лист персонажа',
    fragment:
      'character reference sheet, one single character centered in frame, plain neutral seamless studio background, even soft diffused lighting, entire subject visible, sharp focus, no props, no scenery',
    negative:
      'busy background, cluttered scene, multiple characters, extra people, text, caption, watermark, signature, logo, cropped, out of frame, blurry',
  },
} satisfies Record<Framing, NegatingPresetOption>

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
  // Soul Studio's reference-sheet framing (see FRAMING_PRESETS). Optional and
  // additive: absent → the composed prompt and negative are byte-for-byte what
  // they were before this axis existed.
  framing: framingSchema.optional(),
})
export type PromptPreset = z.infer<typeof promptPresetSchema>

export type ComposedPrompt = { positivePrompt: string; negativePrompt: string }

// The resolved style, reduced to the only two things composition needs. This is
// the SEAM of ADR style-studio D3: a builtin preset and a user's `style` row are
// different records with different lifetimes and different owners, but by the
// time they reach the composer they are indistinguishable — two strings. That is
// what lets a user style apply everywhere a builtin one does without the
// composer, the wire, or the money path learning that user styles exist.
export type StyleFragments = { fragment: string; negative: string }

// Compose the model-facing prompt from the user's text + the structured preset.
//
// Order (fixed, so a stored composedPrompt is reproducible): style, framing,
// shot, motion, quality, then the user's own text LAST so it carries the
// semantic weight. Empty fragments ('none' options, or an unset field)
// contribute nothing — no dangling commas. An unknown id (should be impossible
// past zod, but this is the correctness core) is treated as absent, never as a
// literal.
//
// NEGATIVES ARE NOW JOINED, not assigned. Style used to be the only axis with a
// negative, so a single `=` was enough; framing (Soul Studio) is the second, and
// `negativePrompt = framing.negative` would have silently DROPPED the style's —
// a Disney reference sheet would stop pushing away "photorealistic" the moment
// it started pushing away "busy background". Collecting and joining is the shape
// that survives a third axis. With exactly one negative present the result is
// that string verbatim, so every pre-existing (style-only) request is unchanged.
//
// STYLE ARRIVES AS A PARAMETER, NOT A LOOKUP (ADR style-studio D3). This
// function used to read STYLE_PRESETS[preset.styleId] itself, which is exactly
// what a user-defined style cannot be found by — its fragments live in a db row
// owned by one caller, and a pure function shared with the browser must not
// know how to fetch that. So resolution moves OUT: whoever composes resolves
// the id first (server: registry → builtin or the caller's own row; client:
// resolveBuiltinStyle for a preview) and passes the two strings in. The
// composition itself — the order, the joins, the trim — is untouched, which is
// why a builtin style still produces byte-identical output (pinned by
// "builtin composition is frozen" in presets.test.ts).
//
// The style fragments are gated on `style`, NOT on `preset.styleId`: an id
// without resolved fragments is a caller that skipped resolution, and silently
// composing it as a bare id would put the literal "anime" into the prompt. It
// contributes nothing instead. On the server that state is unreachable by
// construction — create() refuses an unresolvable id before it charges, so the
// failure mode is a 400 rather than an unstyled generation the user paid for.
export function applyPromptPreset(
  userPrompt: string,
  preset?: PromptPreset,
  style?: StyleFragments,
): ComposedPrompt {
  const fragments: string[] = []
  const negatives: string[] = []

  if (style) {
    if (style.fragment) fragments.push(style.fragment)
    if (style.negative) negatives.push(style.negative)
  }
  if (preset?.framing) {
    const framing = FRAMING_PRESETS[preset.framing]
    if (framing?.fragment) fragments.push(framing.fragment)
    if (framing?.negative) negatives.push(framing.negative)
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

  return { positivePrompt: fragments.join(', '), negativePrompt: negatives.join(', ') }
}
