// apps/web/src/modules/Cinema/model/presetOptions.ts
// Select-option builders derived FROM the shared preset tables (contracts
// presets.ts). The picker labels and the server's composition read the SAME
// table, so they cannot disagree (ADR §3). Kept pure/i18n-free: the "no style"
// sentinel row is prepended by the inspector with a translated label, because
// styleId — unlike the modifier axes — has no first-class 'none'.
import {
  cameraMotionSchema,
  cameraShotSchema,
  qualitySchema,
  styleIdSchema,
} from '@opencreate/contracts'
import type {
  CameraMotion,
  CameraShot,
  PromptPreset,
  Quality,
  StyleId,
} from '@opencreate/contracts'
import type { SelectOption } from 'shared/ui'

// Style has no 'none' in its enum, so the picker value widens to allow the
// unset sentinel ('' → no style, composed prompt is just the modifier axes).
export type StyleChoice = StyleId | ''

// The four preset axes as one editable unit — the shape the pickers bind to.
// Lives in the model (not the component) because the draft is data, and the
// conversion helpers below turn it into the wire PromptPreset and back.
export type PresetDraft = {
  styleId: StyleChoice
  cameraShot: CameraShot
  cameraMotion: CameraMotion
  quality: Quality
}

// Draft → wire: drop the unset sentinels so the stored preset stays tidy (a
// 'none' axis contributes an empty fragment anyway). An all-empty draft yields
// {} — still a valid PromptPreset; callers treat that as "no preset" (null).
export function draftToPreset(draft: PresetDraft): PromptPreset {
  return {
    ...(draft.styleId ? { styleId: draft.styleId } : {}),
    ...(draft.cameraShot !== 'none' ? { cameraShot: draft.cameraShot } : {}),
    ...(draft.cameraMotion !== 'none' ? { cameraMotion: draft.cameraMotion } : {}),
    ...(draft.quality !== 'none' ? { quality: draft.quality } : {}),
  }
}

// Wire → draft: fill each axis back to its picker sentinel so a saved shot
// re-opens with the exact choices the user made.
export function presetToDraft(preset: PromptPreset | null): PresetDraft {
  return {
    styleId: preset?.styleId ?? '',
    cameraShot: preset?.cameraShot ?? 'none',
    cameraMotion: preset?.cameraMotion ?? 'none',
    quality: preset?.quality ?? 'none',
  }
}

// True when a draft carries at least one real choice (used to store null vs {}).
export function hasAnyPreset(draft: PresetDraft): boolean {
  return Object.keys(draftToPreset(draft)).length > 0
}

// Built from the enum's option order (not Object.values) so each value stays
// typed as its literal union member, and the picker order is deterministic.
//
// THE LABEL COMES FROM i18n, NOT FROM THE CONTRACT TABLE. contracts/presets.ts
// carries a `label` per preset, but those strings are hardcoded RUSSIAN — they
// are the API's own naming of a preset, not UI copy. Rendering them directly is
// what left the Framing/Camera motion/Quality pickers reading "Любой план" while
// the app was switched to EN. The contract still owns the ID ORDER and the enum
// (so a new preset cannot be missed); the SPA owns how it is spelled to a human.
// Keys live under cinema.preset.<axis>.<id>, so adding a preset without copy
// surfaces as a visible missing key rather than a silent language flip.
type Translate = (key: string) => string

export function styleOptions(t: Translate): SelectOption<StyleId>[] {
  return styleIdSchema.options.map((id) => ({ value: id, label: t(`cinema.preset.style.${id}`) }))
}

export function cameraShotOptions(t: Translate): SelectOption<CameraShot>[] {
  return cameraShotSchema.options.map((id) => ({ value: id, label: t(`cinema.preset.shot.${id}`) }))
}

export function cameraMotionOptions(t: Translate): SelectOption<CameraMotion>[] {
  return cameraMotionSchema.options.map((id) => ({
    value: id,
    label: t(`cinema.preset.motion.${id}`),
  }))
}

export function qualityOptions(t: Translate): SelectOption<Quality>[] {
  return qualitySchema.options.map((id) => ({ value: id, label: t(`cinema.preset.quality.${id}`) }))
}

// Timeline display lengths in seconds (stored as durationMs). Model-independent:
// a video shot's *generation* duration is snapped separately to the model's own
// options (composeShotClipInput), but the strip length is a free editorial choice.
export const SHOT_DURATIONS_SECONDS = [2, 3, 5, 8, 10] as const
