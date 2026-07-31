// apps/web/src/modules/Cinema/model/presetOptions.ts
// Select-option builders derived FROM the shared preset tables (contracts
// presets.ts). The picker labels and the server's composition read the SAME
// table, so they cannot disagree (ADR §3). Kept pure/i18n-free: the "no style"
// sentinel row is prepended by the inspector with a translated label, because
// styleId — unlike the modifier axes — has no first-class 'none'.
import {
  STYLE_PRESETS,
  builtinStyleIdSchema,
  cameraMotionSchema,
  cameraShotSchema,
  qualitySchema,
} from '@opencreate/contracts'
import type {
  CameraMotion,
  CameraShot,
  PromptPreset,
  Quality,
  Style,
  StyleFragments,
  StyleId,
} from '@opencreate/contracts'
import type { SelectOption } from 'shared/ui'

// Style has no 'none' in its enum, so the picker value widens to allow the
// unset sentinel ('' → no style, composed prompt is just the modifier axes).
// StyleId is now an open string (ADR style-studio D1), so this is `string | ''`
// — a user style is a legal value on a shot, and the draft must be able to hold
// one even while the OPTIONS below still come from the builtin table.
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
// `defaultValue` is part of the contract now (see styleOptions): a style id the
// SPA has no copy for must degrade to a real name, not to a visible i18n key.
// Written as two OVERLOADS rather than one optional parameter because i18next's
// own `t` is overloaded the same way, and under exactOptionalPropertyTypes an
// `options?: {...}` signature is not something `TFunction` can satisfy.
type Translate = {
  (key: string): string
  (key: string, options: { defaultValue: string }): string
}

// The seven builtins as registry rows, straight from the bundled table. This is
// the CLIENT HALF of the registry — the same two sources the server unions, with
// the code half available synchronously because it ships in the build.
function bundledBuiltins(): Style[] {
  return builtinStyleIdSchema.options.map((id) => ({
    id,
    name: STYLE_PRESETS[id].label,
    kind: 'prompt' as const,
    builtin: true,
    fragment: STYLE_PRESETS[id].fragment,
    negative: STYLE_PRESETS[id].negative,
    recommendedModelId: STYLE_PRESETS[id].recommendedModelId,
    previewUrl: null,
    // Empty, permanently: a builtin is code and has nowhere to store an uploaded
    // image, so the reference half of the style package (ADR style-studio A1) is
    // only ever populated for a user's own row.
    referenceImages: [],
    createdAt: null,
    updatedAt: null,
  }))
}

// Build the style picker from the REGISTRY (ADR style-studio D5) — builtin rows
// and the caller's own, exactly as GET /api/styles unioned them, so a style
// written in the Style Studio is selectable here without this file knowing it
// exists. The list arrives from the ROUTE as a prop (Cinema must not import
// modules/Styles); see PresetPickers.
//
// AN EMPTY LIST MEANS "NOT LOADED", NEVER "NO STYLES". The registry always
// carries the seven builtins, so there is no honest reading of an empty answer
// as an empty catalogue — and since that table is in the bundle, the picker
// falls back to it instead of disabling itself or showing nothing. A failed or
// in-flight /api/styles costs the user their OWN styles for a moment; it must
// never cost them the ability to pick a style at all.
//
// THE LABEL STILL COMES FROM i18n FOR A BUILTIN. The server sends a builtin's
// `name` straight out of STYLE_PRESETS.label, and those strings are hardcoded
// RUSSIAN — they are the API's own naming, not UI copy. Rendering them is what
// once left these pickers reading «Аниме» in an English app. So a builtin is
// spelled by `cinema.preset.style.<id>`, a USER style is spelled by its own name
// (the user's words, never key-looked-up), and a builtin with no SPA copy falls
// back to the server's name rather than painting a raw key on screen.
export function styleOptions(styles: readonly Style[], t: Translate): SelectOption<StyleChoice>[] {
  return styleRegistry(styles).map((style) => ({
    value: style.id,
    label: style.builtin
      ? t(`cinema.preset.style.${style.id}`, { defaultValue: style.name })
      : style.name,
  }))
}

// The list every style lookup reads from: the server's registry once it has
// landed, the bundled builtins until then. ONE rule, so the picker, the composed
// hint and the model recommendation can never disagree about what a style id
// means at a given moment.
export function styleRegistry(styles: readonly Style[]): readonly Style[] {
  return styles.length > 0 ? styles : bundledBuiltins()
}

// One style by id, or undefined when nothing known answers to it (a deleted
// style still named by an old shot, or a user style before the list arrives).
export function findStyle(styles: readonly Style[], styleId: string): Style | undefined {
  return styleRegistry(styles).find((style) => style.id === styleId)
}

// The fragments a styleId composes with, for the LOCAL preview of the prompt the
// server will build.
//
// UNDER-REPORT, NEVER MIS-REPORT. Before the registry lands, a builtin still
// resolves exactly — it is in the bundle — while a user style resolves to
// undefined and its fragment is simply absent from the preview. The server
// applies it regardless, so the hint is allowed to be incomplete for one request
// but never allowed to show a composition that is not the one being sent.
export function resolveStyleFragments(
  styles: readonly Style[],
  styleId: string,
): StyleFragments | undefined {
  const known = findStyle(styles, styleId)
  return known ? { fragment: known.fragment, negative: known.negative } : undefined
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
// Extended to 15s (2026-07-22): the catalog now offers up to 15s on wan 2.7 /
// Seedance 2.0 / Kling / PixVerse, so the slider must reach there or the user can
// never ask for a clip longer than 10s. Values beyond a model's own max snap down
// at generation (nearestDuration), so 15 on the strip is honest for every model.
export const SHOT_DURATIONS_SECONDS = [2, 3, 5, 8, 10, 12, 15] as const
