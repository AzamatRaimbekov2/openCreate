# scene3d.ts — AI component doc

> AI-facing sidecar for `scene3d.ts`. Created 2026-07-11. Keep this in sync with the code on every change.

## Purpose
The portable scene preset contract for Studio3D (ADR photo-to-3d-studio, decision D4). One JSON shape read by both the three.js viewer (browser preview) and any future server-side renderer (headless Chromium or Blender turntable export), so the renderer stays a swappable implementation detail and the preview the user tweaks matches the video they download.

## What it does (for an AI reader)
- Responsibilities: validate a named lighting/camera/tonemap/render rig; ship a fixed, server-owned catalog of 4 presets (`studio`, `product`, `dramatic`, `neon`); resolve a preset by id.
- Public API / exports: `scenePresetSchema` (zod), `ScenePreset` (inferred type), `SCENE_PRESETS` (the 4-entry array), `getScenePreset(id): ScenePreset | undefined`.
- Inputs → Outputs: a preset `id` string → the matching `ScenePreset` object, or `undefined` if unknown. `scenePresetSchema.parse`/`safeParse` validate arbitrary JSON (e.g. a future server renderer's own copy, or a request body) against the shape.
- Side effects: none (pure schema + static data).

## Dependencies
- Imports / depends on: `zod`.
- Used by: (not yet wired) the three.js viewer's preset picker, and later the server-side turntable renderer — both will import `SCENE_PRESETS`/`getScenePreset` so there is exactly one lighting/camera source of truth. The client is expected to send a preset `id` token, never a raw lighting rig.

## Diagram
```mermaid
flowchart LR
  CLIENT[client sends preset id] --> GET[getScenePreset]
  GET --> PRESET[ScenePreset JSON]
  PRESET --> THREE[three.js viewer<br/>AgXToneMapping, 2**exposureEv, vertical FOV]
  PRESET --> SERVER[future server renderer<br/>Blender view_settings.exposure, horizontal-FOV camera.angle, Z-up conversion]
```

## Key decisions / gotchas
- Five unit conventions are load-bearing and intentionally over-commented in the code — breaking any one makes the browser preview and the rendered video diverge silently:
  1. `tonemap.exposureEv` is stored in **EV/stops** (Blender's native unit). three.js's `toneMappingExposure` is a linear multiplier, so the three-side consumer must compute `2 ** exposureEv` — never store the multiplier directly.
  2. `camera.fovVertical` is **vertical** degrees (three's native `PerspectiveCamera.fov`). Blender's `camera.angle` is horizontal by default (`sensor_fit = AUTO`) and must be converted on that side.
  3. `upAxis` is declared (`'Y'` only, for now) because glTF/three are Y-up but Blender is Z-up; the glTF importer fixes the mesh, but the orbit camera path defined here does not auto-convert.
  4. `tonemap.curve` is pinned to the literal `'agx'` — the schema has no other allowed value on purpose. three's `AgXToneMapping` is a faithful port of Blender's AgX view transform (its 4.0+ default); three's `ACES` is a hand-fitted approximation that does NOT match Blender's ACES. A curve without cross-renderer parity is treated as a bug, not an option.
  5. `environment.rotationYRad` is **RADIANS**, matching three's `environmentRotation` directly (field renamed from `rotationY` in review — the original name had no declared unit, exactly the bug class this file exists to prevent, given the preset values of 0/0.35/1.2/2.1 only make sense as radians). It maps conceptually to Blender's world Mapping node `rotation.z`, but sign and zero-offset differ between the two engines, so that conversion is a calibration constant that belongs in the Blender exporter, not baked into the preset.
- `camera.orbit.azimuthStartDeg`/`azimuthEndDeg` are deliberately unbounded and cyclic, not clamped to `[0, 360)` — the `dramatic` preset spans -30 -> 330 on purpose, to center its sweep on the model's front. A "tidying" clamp would silently break that.
- Presets are **server-owned and named** (`SCENE_PRESETS` is a closed catalog): the wire contract is a token id, never an arbitrary lighting rig, so renders stay reproducible and the preset surface can't grow into an unbounded API.
- `camera.marginPct` + `camera.orbit.radiusFactor` encode deterministic framing (derive camera distance from the model's bounding-sphere radius) rather than drei's `<Bounds>` auto-framing — the exact same arithmetic must run in whatever renders the final video, so it can't live only inside a React Three Fiber helper.
- HDRI ids (`environment.hdriId`) point at self-hosted files (`public/hdri/<id>.hdr|.exr`, not yet added), deliberately never drei's built-in `preset="studio"` shortcut — those fetch from a GitHub-hosted CDN that drei's own docs say is not for production use.
- `dramatic` and `neon` presets are built by spreading a shared `base` object and then overriding `tonemap` afterward — object spread + key order means the later `tonemap` key wins; covered by the "applies the dramatic preset exposure override after spreading base" test so a future refactor that reorders the spread breaks loudly instead of silently reverting to `exposureEv: 0`.
- The "stores exposure in EV stops, not as a linear multiplier" test from the first cut was renamed to "keeps exposureEv within the documented EV range" (review finding): it only ever asserted the schema's own `[-4, 4]` bound, which cannot verify the semantic claim in its old name (that claim is a contract on the CONSUMER — three must compute `2 ** exposureEv` — and no test in this file can check consumer behavior it doesn't own).

## Commits
- 863a9c0 feat(contracts): portable scene preset (one JSON, N renderers)
- 9aec552 fix(contracts): declare scene preset rotation unit, drop tautological test
