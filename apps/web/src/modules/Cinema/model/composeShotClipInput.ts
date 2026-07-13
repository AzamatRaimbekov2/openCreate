// apps/web/src/modules/Cinema/model/composeShotClipInput.ts
// Pure translation from a timeline Shot + a chosen catalog model into the
// POST /api/generations body that renders that shot's clip.
//
// WHY A PURE FUNCTION (and why it is unit-tested):
// This is the one place CinemaStudio decides what the model is asked to make.
// The preset stays STRUCTURED all the way to the wire — we NEVER concatenate
// fragments into `prompt` (ADR §3): the client sends `promptPreset` and the
// SERVER composes. So this function only forwards the shot's own text + its
// structured preset, and derives the two model-shaped params (aspect + duration)
// the generation endpoint needs. Keeping it pure means the mapping is provable
// without a network — see composeShotClipInput.test.ts.
import type { AspectRatio, CatalogModel, CreateGenerationInput, Shot } from '@opencreate/contracts'

// Pick the duration option closest to the shot's timeline length. A video model
// prices per its own `durationOptions` list, so an arbitrary second count would
// be rejected — we snap to the nearest offered value. `options` is guaranteed
// non-empty by the catalog schema (min 1); the seed makes that explicit to TS.
export function nearestDuration(options: number[], seconds: number): number {
  const [first, ...rest] = options
  // first is possibly-undefined under noUncheckedIndexedAccess; fall back to the
  // requested seconds if the (schema-forbidden) empty list ever reaches here.
  let best = first ?? seconds
  for (const option of rest) {
    if (Math.abs(option - seconds) < Math.abs(best - seconds)) best = option
  }
  return best
}

// Build the generation request for one shot. The film's canvas aspect wins when
// the model supports it, otherwise we fall back to the model's first ratio (the
// render scales/pads every shot to the film canvas anyway). Duration is only a
// video dimension; image models carry none.
export function composeShotClipInput(
  shot: Shot,
  model: CatalogModel,
  filmAspect: AspectRatio,
): CreateGenerationInput {
  const aspectRatio = model.aspectRatios.includes(filmAspect)
    ? filmAspect
    : (model.aspectRatios[0] ?? filmAspect)

  const input: CreateGenerationInput = {
    modelId: model.id,
    prompt: shot.prompt,
    aspectRatio,
    // Omit the key entirely when the shot has no preset — an absent preset
    // composes to exactly the user's text (exactOptionalPropertyTypes: no null).
    ...(shot.promptPreset ? { promptPreset: shot.promptPreset } : {}),
    // The shot's CAST. Forwarding it is what makes the film hold together: the
    // server substitutes each name into the prompt and attaches that character's
    // photo as a reference, so shot 2 shows the same fox as shot 1.
    //
    // Omitted when empty, exactly like the preset above — sending `[]` would be a
    // claim that the user tagged nobody ON PURPOSE, and the API's own tagging
    // branch keys off a non-empty list.
    ...(shot.entityRefs.length > 0 ? { entityRefs: shot.entityRefs } : {}),
  }

  if (model.type === 'video') {
    return {
      ...input,
      duration: nearestDuration(model.durationOptions, Math.round(shot.durationMs / 1000)),
    }
  }
  return input
}
