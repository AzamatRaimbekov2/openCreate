import { describe, expect, it } from 'vitest'
import { SCENE_PRESETS, getScenePreset, scenePresetSchema } from './scene3d'

describe('scene presets', () => {
  it('ships four presets and every one satisfies the schema', () => {
    expect(SCENE_PRESETS).toHaveLength(4)
    for (const p of SCENE_PRESETS) expect(scenePresetSchema.parse(p)).toEqual(p)
  })

  it('resolves a preset by id and returns undefined for an unknown one', () => {
    expect(getScenePreset('studio')?.id).toBe('studio')
    expect(getScenePreset('nope')).toBeUndefined()
  })

  it('keeps exposureEv within the documented EV range', () => {
    const studio = getScenePreset('studio')!
    expect(studio.tonemap.exposureEv).toBeGreaterThanOrEqual(-4)
    expect(studio.tonemap.exposureEv).toBeLessThanOrEqual(4)
  })

  it('pins every preset to the AgX tone curve', () => {
    for (const p of SCENE_PRESETS) expect(p.tonemap.curve).toBe('agx')
    expect(scenePresetSchema.safeParse({ ...SCENE_PRESETS[0], tonemap: { curve: 'aces', exposureEv: 0 } }).success).toBe(false)
  })

  it('declares a vertical FOV and a Y-up axis', () => {
    const p = getScenePreset('product')!
    expect(p.camera.fovVertical).toBeGreaterThan(0)
    expect(p.upAxis).toBe('Y')
  })

  it('applies the dramatic preset exposure override after spreading base', () => {
    expect(getScenePreset('dramatic')!.tonemap.exposureEv).toBe(-0.5)
  })
})
