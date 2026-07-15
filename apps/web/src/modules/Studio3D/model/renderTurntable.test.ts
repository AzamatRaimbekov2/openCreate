// apps/web/src/modules/Studio3D/model/renderTurntable.test.ts
// Proves the two properties that make the client-side turntable render defensible:
// (1) the frame grid is derived from fps/duration and stamped from the frame INDEX,
// (2) the render loop drives drawFrame exactly frameCount times with normalized t.
// The codec itself is NOT exercised here — jsdom has no WebCodecs — so the encode
// step is injected as a fake sink. See renderTurntable.ts.md.
import { describe, expect, it, vi } from 'vitest'
import { SCENE_PRESETS } from '@opencreate/contracts'
import type { ScenePreset } from '@opencreate/contracts'
import {
  isTurntableSupported,
  renderTurntable,
  turntableFrameCount,
  turntableTimestamps,
} from './renderTurntable'
import type { TurntableFrameSink } from './renderTurntable'

describe('turntable timing', () => {
  it('derives the frame count from fps and duration', () => {
    expect(turntableFrameCount({ fps: 30, durationSec: 6 })).toBe(180)
  })

  it('emits monotonically increasing microsecond timestamps at a FIXED timestep', () => {
    // This is the whole reason we use WebCodecs instead of MediaRecorder: frames are
    // stamped from the INDEX (t = i/fps), never from the wall clock. So a GC pause, a
    // slow GPU, or a backgrounded tab changes how LONG the encode takes and NOTHING
    // about the output. MediaRecorder captures in realtime and drops frames instead.
    const stamps = turntableTimestamps({ fps: 30, durationSec: 1 })
    expect(stamps).toHaveLength(30)
    expect(stamps[0]).toBe(0)
    expect(stamps[1]).toBe(33_333) // 1e6 / 30, floored
    for (let i = 1; i < stamps.length; i++) expect(stamps[i]!).toBeGreaterThan(stamps[i - 1]!)
  })

  it('reports unsupported when VideoEncoder is absent', () => {
    vi.stubGlobal('VideoEncoder', undefined)
    expect(isTurntableSupported()).toBe(false)
  })

  it('reports supported when VideoEncoder is present', () => {
    vi.stubGlobal('VideoEncoder', class {})
    expect(isTurntableSupported()).toBe(true)
  })
})

// A ScenePreset with a tiny, cheap frame grid: 10 fps x 1s = 10 frames.
const preset: ScenePreset = { ...SCENE_PRESETS[0]!, render: { width: 64, height: 64, fps: 10, durationSec: 1 } }

type FakeSink = TurntableFrameSink & {
  stamps: number[]
  canceled: number
}

function fakeSink(): FakeSink {
  const sink: FakeSink = {
    stamps: [],
    canceled: 0,
    addFrame: (timestampMicros) => {
      sink.stamps.push(timestampMicros)
      return Promise.resolve()
    },
    finish: () => Promise.resolve(new Blob([new Uint8Array([0, 1, 2])], { type: 'video/mp4' })),
    cancel: () => {
      sink.canceled += 1
      return Promise.resolve()
    },
  }
  return sink
}

describe('renderTurntable', () => {
  it('drives drawFrame exactly frameCount times, with indices 0..n-1 and t in [0,1)', async () => {
    // Determinism lives here: every frame is drawn once, in order, at a t derived from
    // its index — so the same preset produces the same camera path on every machine.
    const sink = fakeSink()
    const drawn: Array<{ index: number; t: number }> = []
    const percents: number[] = []

    const blob = await renderTurntable({
      preset,
      canvas: document.createElement('canvas'),
      drawFrame: (index, t) => drawn.push({ index, t }),
      onProgress: (percent) => percents.push(percent),
      createSink: () => Promise.resolve(sink),
    })

    const frames = turntableFrameCount(preset.render)
    expect(drawn).toHaveLength(frames)
    expect(drawn.map((frame) => frame.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    for (const frame of drawn) {
      expect(frame.t).toBeGreaterThanOrEqual(0)
      expect(frame.t).toBeLessThan(1)
      expect(frame.t).toBeCloseTo(frame.index / frames, 10)
    }
    // Every drawn frame reached the encoder, stamped from its index — not the clock.
    expect(sink.stamps).toEqual(turntableTimestamps(preset.render))
    expect(percents.at(-1)).toBe(100)
    expect(blob.type).toBe('video/mp4')
  })

  it('aborts mid-encode: stops drawing, cancels the sink, rejects', async () => {
    const sink = fakeSink()
    const controller = new AbortController()
    let drawCalls = 0

    const promise = renderTurntable({
      preset,
      canvas: document.createElement('canvas'),
      drawFrame: (index) => {
        drawCalls += 1
        if (index === 2) controller.abort()
      },
      signal: controller.signal,
      createSink: () => Promise.resolve(sink),
    })

    await expect(promise).rejects.toThrow()
    // Frames 0..2 were drawn; the check at the top of frame 3 threw.
    expect(drawCalls).toBe(3)
    expect(sink.canceled).toBe(1)
  })
})
