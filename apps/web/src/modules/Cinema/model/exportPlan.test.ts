// apps/web/src/modules/Cinema/model/exportPlan.test.ts
// The client export's LOAD-BEARING correctness: the per-frame timeline that must
// match the server ffmpeg render (apps/api/src/modules/films/render.ts) — concat by
// order, per-shot trim, crossfade OVERLAP that shortens the total, and the blend
// factor inside a fade. Pure, so every boundary is pinned with no WebCodecs/canvas.
import { buildSegmentTimeline, exportPlan } from './exportPlan'
import type { Shot } from '@opencreate/contracts'

function makeShot(overrides: Partial<Shot>): Shot {
  return {
    id: 'shot1',
    filmId: 'film1',
    orderIndex: 1,
    generationId: 'gen1',
    prompt: '',
    promptPreset: null,
    entityRefs: [],
    referenceImages: [],
    modelId: null,
    durationMs: 4000,
    trimStartMs: 0,
    transition: 'none',
    transitionMs: 0,
    title: null,
    voiceover: null,
    audio: false,
    createdAt: '2026-07-23T10:00:00.000Z',
    ...overrides,
  }
}

describe('buildSegmentTimeline', () => {
  it('lays hard cuts end to end', () => {
    const { segments, totalMs } = buildSegmentTimeline([
      makeShot({ id: 'a', durationMs: 4000 }),
      makeShot({ id: 'b', durationMs: 6000 }),
    ])
    expect(segments.map((s) => s.startMs)).toEqual([0, 4000])
    expect(totalMs).toBe(10_000)
  })

  it('OVERLAPS a crossfade, shortening the total by the transition', () => {
    // b crossfades into a over 1000ms → b starts 1000ms before a ends; total −1000.
    const { segments, totalMs } = buildSegmentTimeline([
      makeShot({ id: 'a', durationMs: 4000 }),
      makeShot({ id: 'b', durationMs: 6000, transition: 'crossfade', transitionMs: 1000 }),
    ])
    expect(segments[0]?.startMs).toBe(0)
    expect(segments[1]?.startMs).toBe(3000) // 4000 − 1000
    expect(segments[1]?.crossfadeMs).toBe(1000)
    expect(totalMs).toBe(9000) // 4000 + 6000 − 1000
  })

  it('clamps a crossfade longer than its neighbours to a hard-ish cap', () => {
    // transitionMs 9999 clamped to min(prevLen−50, dur−50) = min(3950, 5950) = 3950.
    const { segments } = buildSegmentTimeline([
      makeShot({ id: 'a', durationMs: 4000 }),
      makeShot({ id: 'b', durationMs: 6000, transition: 'crossfade', transitionMs: 9999 }),
    ])
    expect(segments[1]?.crossfadeMs).toBe(3950)
  })
})

describe('exportPlan', () => {
  it('sizes the canvas + fps from the aspect (matching the server render)', () => {
    const plan = exportPlan([makeShot({ id: 'a', durationMs: 1000 })], '16:9', 30)
    expect(plan.width).toBe(1280)
    expect(plan.height).toBe(720)
    expect(plan.fps).toBe(30)
    expect(plan.frameCount).toBe(30) // 1s × 30fps
    expect(plan.frames).toHaveLength(30)
  })

  it('stamps frames from the index in microseconds (deterministic, not wall clock)', () => {
    const plan = exportPlan([makeShot({ id: 'a', durationMs: 1000 })], '1:1', 30)
    expect(plan.frames[0]?.timestampMicros).toBe(0)
    expect(plan.frames[1]?.timestampMicros).toBe(Math.floor(1_000_000 / 30))
  })

  it('maps a frame to its shot and the source offset (trim applied)', () => {
    // Shot a trimmed to start 2000ms in; the frame 0.5s into the timeline reads
    // source 2000 + 500 = 2500ms.
    const plan = exportPlan([makeShot({ id: 'a', durationMs: 4000, trimStartMs: 2000 })], '16:9', 30)
    const frame = plan.frames[15] // 15/30 = 0.5s
    expect(frame?.shotId).toBe('a')
    expect(frame?.sourceMs).toBe(2500)
    expect(frame?.fade).toBeNull()
  })

  it('hands an exact cut boundary to the NEXT shot at source offset 0 (+ its trim)', () => {
    const plan = exportPlan(
      [makeShot({ id: 'a', durationMs: 1000 }), makeShot({ id: 'b', durationMs: 1000, trimStartMs: 500 })],
      '16:9',
      30,
    )
    // Frame 30 is exactly at 1000ms — the a→b boundary; b owns it at source 500+0.
    expect(plan.frames[30]?.shotId).toBe('b')
    expect(plan.frames[30]?.sourceMs).toBe(500)
  })

  it('blends inside a crossfade: the incoming shot on top, alpha ramping 0→1', () => {
    const plan = exportPlan(
      [
        makeShot({ id: 'a', durationMs: 2000 }),
        makeShot({ id: 'b', durationMs: 2000, transition: 'crossfade', transitionMs: 1000 }),
      ],
      '16:9',
      30,
    )
    // b starts at 1000ms; the crossfade region is [1000, 2000). A frame at 1500ms
    // is halfway through the fade → alpha ≈ 0.5, incoming = b, outgoing = a.
    const frame = plan.frames.find((f) => f.timestampMicros >= 1_500_000) // ~1.5s
    expect(frame?.shotId).toBe('b')
    expect(frame?.fade?.fromShotId).toBe('a')
    expect(frame?.fade?.alpha).toBeGreaterThan(0.4)
    expect(frame?.fade?.alpha).toBeLessThan(0.6)
  })

  it('is empty-safe (a film with no shots)', () => {
    const plan = exportPlan([], '16:9', 30)
    expect(plan.frameCount).toBe(0)
    expect(plan.frames).toEqual([])
    expect(plan.durationMs).toBe(0)
  })
})
