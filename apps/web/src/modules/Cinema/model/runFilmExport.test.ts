// apps/web/src/modules/Cinema/model/runFilmExport.test.ts
// The export orchestrator LOOP (renderTurntable precedent): it walks the pure
// exportPlan, drawing + encoding each frame, then the audio, then finishes — and on
// abort/error it tears the sink down (no leak). Tested with FAKE sink + draw so the
// loop's correctness is pinned in jsdom without WebCodecs/canvas.
import { exportPlan } from './exportPlan'
import { runFilmExport } from './runFilmExport'
import type { FilmExportSink } from './filmExportPorts'
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
    durationMs: 1000,
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

function fakeSink(overrides: Partial<FilmExportSink> = {}) {
  return {
    addFrame: vi.fn(async () => undefined),
    addAudio: vi.fn(async () => undefined),
    finish: vi.fn(async () => new Blob(['mp4'], { type: 'video/mp4' })),
    cancel: vi.fn(async () => undefined),
    ...overrides,
  }
}

const canvas = () => document.createElement('canvas')
const plan1s = () => exportPlan([makeShot({ durationMs: 1000 })], '16:9', 30) // 30 frames
const emptyAudio = { totalMs: 1000, sources: [] }

describe('runFilmExport', () => {
  it('draws + encodes every frame, then adds audio, then finishes', async () => {
    const sink = fakeSink()
    const drawFrame = vi.fn(async () => undefined)
    const progress: number[] = []

    const result = await runFilmExport({
      plan: plan1s(),
      audioPlan: emptyAudio,
      canvas: canvas(),
      drawFrame,
      createSink: async () => sink,
      onProgress: (percent) => progress.push(percent),
    })

    expect(drawFrame).toHaveBeenCalledTimes(30)
    expect(sink.addFrame).toHaveBeenCalledTimes(30)
    // Audio and finish happen AFTER all the frames.
    expect(sink.addAudio).toHaveBeenCalledTimes(1)
    expect(sink.finish).toHaveBeenCalledTimes(1)
    expect(sink.cancel).not.toHaveBeenCalled()
    expect(result).toBeInstanceOf(Blob)
    // Progress is monotonic and reaches the top.
    expect(progress[0]).toBeGreaterThan(0)
    expect(progress.at(-1)).toBe(100)
  })

  it('stamps frames at the plan timestamps with the nominal frame duration', async () => {
    const sink = fakeSink()
    await runFilmExport({
      plan: plan1s(),
      audioPlan: emptyAudio,
      canvas: canvas(),
      drawFrame: vi.fn(async () => undefined),
      createSink: async () => sink,
    })
    const dur = Math.floor(1_000_000 / 30)
    expect(sink.addFrame).toHaveBeenNthCalledWith(1, 0, dur)
    expect(sink.addFrame).toHaveBeenNthCalledWith(2, dur, dur)
  })

  it('aborts cleanly: stops the loop, cancels the sink, never finishes', async () => {
    const controller = new AbortController()
    // Abort during the first frame; the next iteration's throwIfAborted fires.
    const sink = fakeSink({ addFrame: vi.fn(async () => controller.abort()) })
    const drawFrame = vi.fn(async () => undefined)

    await expect(
      runFilmExport({
        plan: plan1s(),
        audioPlan: emptyAudio,
        canvas: canvas(),
        drawFrame,
        createSink: async () => sink,
        signal: controller.signal,
      }),
    ).rejects.toThrow()

    expect(sink.cancel).toHaveBeenCalledTimes(1)
    expect(sink.finish).not.toHaveBeenCalled()
    // The loop stopped early — only the first frame was drawn/encoded.
    expect(drawFrame).toHaveBeenCalledTimes(1)
  })

  it('tears the sink down when a frame encode throws', async () => {
    const sink = fakeSink({
      addFrame: vi.fn(async () => {
        throw new Error('encoder died')
      }),
    })
    await expect(
      runFilmExport({
        plan: plan1s(),
        audioPlan: emptyAudio,
        canvas: canvas(),
        drawFrame: vi.fn(async () => undefined),
        createSink: async () => sink,
      }),
    ).rejects.toThrow('encoder died')
    expect(sink.cancel).toHaveBeenCalledTimes(1)
  })
})
