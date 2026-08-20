// apps/web/src/modules/Cinema/model/exportToCanvas.test.ts
// Pins buildCanvasDocFromFilm's conversion rules: order + edge chaining,
// which shots get dropped and why, the per-shot aspect override, and the
// "nothing to export" result.
import type { Film, Generation, Shot } from '@opencreate/contracts'
import { buildCanvasDocFromFilm } from './exportToCanvas'

function makeFilm(overrides: Partial<Film> = {}): Film {
  return {
    id: 'film1',
    title: 'Neon Drift',
    aspectRatio: '16:9',
    defaultStyleId: null,
    templateId: null,
    batchId: null,
    coverUrl: null,
    createdAt: '2026-07-09T10:00:00.000Z',
    updatedAt: '2026-07-09T10:00:00.000Z',
    ...overrides,
  }
}

function makeShot(overrides: Partial<Shot> = {}): Shot {
  return {
    id: 'shot1',
    filmId: 'film1',
    orderIndex: 1,
    generationId: null,
    prompt: 'a lighthouse in a storm',
    promptPreset: null,
    entityRefs: [],
    referenceImages: [],
    modelId: null,
    aspectRatio: null,
    durationMs: 5000,
    trimStartMs: 0,
    transition: 'none',
    transitionMs: 0,
    title: null,
    voiceover: null,
    audio: false,
    createdAt: '2026-07-09T10:00:00.000Z',
    ...overrides,
  }
}

function makeGeneration(overrides: Partial<Generation> = {}): Generation {
  return {
    id: 'gen1',
    type: 'video',
    mode: 'text',
    status: 'succeeded',
    prompt: 'x',
    modelId: 'wan-2-7',
    params: {},
    costCredits: 85,
    mediaUrls: ['/media/gen1.mp4'],
    errorMessage: null,
    createdAt: '2026-07-09T10:00:00.000Z',
    completedAt: '2026-07-09T10:00:30.000Z',
    ...overrides,
  }
}

describe('buildCanvasDocFromFilm', () => {
  it('converts shots in orderIndex order, chained by sequential edges', () => {
    const shots = [
      makeShot({ id: 'b', orderIndex: 2, generationId: 'gen-b', prompt: 'second' }),
      makeShot({ id: 'a', orderIndex: 1, generationId: 'gen-a', prompt: 'first' }),
    ]
    const generationsById = {
      'gen-a': makeGeneration({ id: 'gen-a' }),
      'gen-b': makeGeneration({ id: 'gen-b' }),
    }

    const doc = buildCanvasDocFromFilm(makeFilm(), shots, generationsById)

    expect(doc).not.toBeNull()
    expect(doc?.nodes).toHaveLength(2)
    expect(doc?.nodes[0]?.config.prompt).toBe('first')
    expect(doc?.nodes[1]?.config.prompt).toBe('second')
    expect(doc?.nodes[0]?.position).toEqual({ x: 0, y: 0 })
    expect(doc?.nodes[1]?.position).toEqual({ x: 320, y: 0 })
    expect(doc?.edges).toHaveLength(1)
    expect(doc?.edges[0]).toEqual({
      id: expect.any(String),
      sourceNodeId: doc?.nodes[0]?.id,
      targetNodeId: doc?.nodes[1]?.id,
    })
    // Full 36-char UUIDs, never truncated (global PK across canvases)
    expect(doc?.nodes[0]?.id).toHaveLength(36)
  })

  it('skips a shot whose generationId is null (a title card)', () => {
    const shots = [
      makeShot({ id: 'a', orderIndex: 1, generationId: null }),
      makeShot({ id: 'b', orderIndex: 2, generationId: 'gen-b' }),
    ]
    const doc = buildCanvasDocFromFilm(makeFilm(), shots, {
      'gen-b': makeGeneration({ id: 'gen-b' }),
    })

    expect(doc?.nodes).toHaveLength(1)
    expect(doc?.nodes[0]?.generationIds).toEqual(['gen-b'])
  })

  it('skips a shot citing a generation that is not succeeded', () => {
    const shots = [
      makeShot({ id: 'a', orderIndex: 1, generationId: 'gen-processing' }),
      makeShot({ id: 'b', orderIndex: 2, generationId: 'gen-failed' }),
      makeShot({ id: 'c', orderIndex: 3, generationId: 'gen-ok' }),
    ]
    const doc = buildCanvasDocFromFilm(makeFilm(), shots, {
      'gen-processing': makeGeneration({ id: 'gen-processing', status: 'processing' }),
      'gen-failed': makeGeneration({ id: 'gen-failed', status: 'failed', mediaUrls: [] }),
      'gen-ok': makeGeneration({ id: 'gen-ok' }),
    })

    expect(doc?.nodes).toHaveLength(1)
    expect(doc?.nodes[0]?.generationIds).toEqual(['gen-ok'])
  })

  it('skips a shot whose cited generation is not in the lookup, and one with no media', () => {
    const shots = [
      makeShot({ id: 'a', orderIndex: 1, generationId: 'gen-missing' }),
      makeShot({ id: 'b', orderIndex: 2, generationId: 'gen-no-media' }),
      makeShot({ id: 'c', orderIndex: 3, generationId: 'gen-ok' }),
    ]
    const doc = buildCanvasDocFromFilm(makeFilm(), shots, {
      'gen-no-media': makeGeneration({ id: 'gen-no-media', mediaUrls: [] }),
      'gen-ok': makeGeneration({ id: 'gen-ok' }),
    })

    expect(doc?.nodes).toHaveLength(1)
    expect(doc?.nodes[0]?.generationIds).toEqual(['gen-ok'])
  })

  it("uses the shot's own aspectRatio override when present", () => {
    const shots = [
      makeShot({ id: 'a', orderIndex: 1, generationId: 'gen-a', aspectRatio: '9:16' }),
    ]
    const doc = buildCanvasDocFromFilm(makeFilm({ aspectRatio: '16:9' }), shots, {
      'gen-a': makeGeneration({ id: 'gen-a' }),
    })

    expect(doc?.nodes[0]?.config.aspectRatio).toBe('9:16')
  })

  it("falls back to the film's aspectRatio when the shot has none", () => {
    const shots = [makeShot({ id: 'a', orderIndex: 1, generationId: 'gen-a', aspectRatio: null })]
    const doc = buildCanvasDocFromFilm(makeFilm({ aspectRatio: '1:1' }), shots, {
      'gen-a': makeGeneration({ id: 'gen-a' }),
    })

    expect(doc?.nodes[0]?.config.aspectRatio).toBe('1:1')
  })

  it('picks the node kind from the generation type (video vs image)', () => {
    const shots = [
      makeShot({ id: 'a', orderIndex: 1, generationId: 'gen-img' }),
      makeShot({ id: 'b', orderIndex: 2, generationId: 'gen-vid' }),
    ]
    const doc = buildCanvasDocFromFilm(makeFilm(), shots, {
      'gen-img': makeGeneration({ id: 'gen-img', type: 'image', mode: 'text', mediaUrls: ['/media/i.png'] }),
      'gen-vid': makeGeneration({ id: 'gen-vid', type: 'video' }),
    })

    expect(doc?.nodes[0]?.kind).toBe('image')
    expect(doc?.nodes[1]?.kind).toBe('video')
  })

  it('never sets config.duration — ms-to-seconds unit mismatch would misvalidate', () => {
    const shots = [
      makeShot({ id: 'a', orderIndex: 1, generationId: 'gen-a', durationMs: 45_000 }),
    ]
    const doc = buildCanvasDocFromFilm(makeFilm(), shots, {
      'gen-a': makeGeneration({ id: 'gen-a' }),
    })

    expect(doc?.nodes[0]?.config.duration).toBeUndefined()
  })

  it('truncates a long combined title to the 120-char contract cap', () => {
    const longTitle = 'A'.repeat(200)
    const shots = [makeShot({ id: 'a', orderIndex: 1, generationId: 'gen-a' })]
    const doc = buildCanvasDocFromFilm(makeFilm({ title: longTitle }), shots, {
      'gen-a': makeGeneration({ id: 'gen-a' }),
    })

    expect(doc?.title.length).toBe(120)
  })

  it('returns null when there is nothing exportable (all title cards)', () => {
    const shots = [
      makeShot({ id: 'a', orderIndex: 1, generationId: null }),
      makeShot({ id: 'b', orderIndex: 2, generationId: null }),
    ]
    expect(buildCanvasDocFromFilm(makeFilm(), shots, {})).toBeNull()
  })

  it('returns null for a film with zero shots', () => {
    expect(buildCanvasDocFromFilm(makeFilm(), [], {})).toBeNull()
  })
})
