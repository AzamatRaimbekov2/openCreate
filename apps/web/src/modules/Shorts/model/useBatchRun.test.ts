// The batch runner. This is the largest single spend the product offers (ADR
// shorts-studio: ten shorts × four beats on a standard tier is ~1,400 credits),
// so every rule below is a money rule and none of them is decorative:
//
//   * a beat that ALREADY cites a generation is never re-submitted — re-running
//     it would charge a second time for a clip that exists;
//   * NEVER more than four submits in flight (§7: POST /api/generations is
//     rate-limited to 20/min and a polling clip costs ~15 req/min against a
//     300/min wall);
//   * one failed beat records against ITSELF and the batch CONTINUES (§3,
//     following ExtractStage). Nothing is refunded by the runner — generations
//     .create already refunded internally before the error reached us;
//   * cancel is checked BEFORE every submit, off a token that lives outside
//     React. A re-render must not be what stops a run that spends money;
//   * the submit retry allowlist is the one from Cinema's shotGeneration —
//     content_blocked / validation_failed / insufficient_credits are never
//     retried, because repeating them either cannot help or costs again.
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FilmDetail, Generation, Shot } from '@opencreate/contracts'
import { ApiClientError, api } from 'shared/libs/apiClient'
import { MAX_IN_FLIGHT, collectBatchWork, resetBatchRun, useBatchRun } from './useBatchRun'
import { TIER_MODEL } from './testFixtures'

vi.mock('shared/libs/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared/libs/apiClient')>()
  return { ...actual, api: vi.fn() }
})
const apiMock = vi.mocked(api)

const shot = (id: string, overrides: Partial<Shot> = {}): Shot => ({
  id,
  filmId: 'f1',
  orderIndex: 0,
  generationId: null,
  prompt: 'a fox crosses the street',
  promptPreset: null,
  entityRefs: [],
  referenceImages: [],
  modelId: TIER_MODEL.id,
  aspectRatio: null,
  durationMs: 8000,
  trimStartMs: 0,
  transition: 'none',
  transitionMs: 0,
  title: null,
  voiceover: null,
  audio: false,
  createdAt: '2026-08-20T10:00:00.000Z',
  ...overrides,
})

// A short: one free title card + `beats` payable beats.
const film = (filmId: string, beats = 2): FilmDetail => ({
  film: {
    id: filmId,
    title: filmId,
    aspectRatio: '9:16',
    defaultStyleId: null,
    templateId: 'street-hook',
    batchId: 'batch-1',
    coverUrl: null,
    createdAt: '2026-08-20T10:00:00.000Z',
    updatedAt: '2026-08-20T10:00:00.000Z',
  },
  shots: [
    shot(`${filmId}-title`, { filmId, prompt: '', modelId: null }),
    ...Array.from({ length: beats }, (_, index) =>
      shot(`${filmId}-b${index}`, { filmId, orderIndex: index + 1 }),
    ),
  ],
  audio: [],
  latestRender: null,
})

// POST /api/generations → a fresh processing row. GET /api/generations/:id →
// whatever this test decided that submit settles as. PATCH /shots/:id echoes a
// shot. Every terminal status arrives on the FIRST poll, so the loop never
// sleeps and these specs need no fake timers.
type Outcome = { status: Generation['status']; errorCode?: string }

function mockRuns(outcome: (submitIndex: number) => Outcome | Error) {
  let submits = 0
  let inFlight = 0
  let peakInFlight = 0
  const statusById = new Map<string, Outcome>()
  apiMock.mockImplementation((path: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (method === 'POST' && path === '/api/generations') {
      submits += 1
      const decided = outcome(submits)
      if (decided instanceof Error) return Promise.reject(decided)
      inFlight += 1
      peakInFlight = Math.max(peakInFlight, inFlight)
      const id = `g${submits}`
      statusById.set(id, decided)
      return Promise.resolve({ id, status: 'processing', mediaUrls: [] } as unknown as never)
    }
    if (method === 'PATCH') return Promise.resolve({ id: 'patched' } as unknown as never)
    // A poll. The slot is released HERE: a worker owns its beat from submit
    // through to a terminal poll, which is what actually bounds concurrency —
    // both the 20/min submit bucket and the ~15 req/min each live clip polls at.
    const id = path.split('/').pop() ?? ''
    const settled = statusById.get(id)
    if (settled) {
      inFlight -= 1
      statusById.delete(id)
    }
    return Promise.resolve({
      id,
      status: settled?.status ?? 'processing',
      mediaUrls: [],
      errorCode: settled?.errorCode ?? null,
    } as unknown as never)
  })
  return { submits: () => submits, peakInFlight: () => peakInFlight }
}

const postBodies = () =>
  apiMock.mock.calls
    .filter(
      ([path, init]) => path === '/api/generations' && (init as RequestInit)?.method === 'POST',
    )
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>)

const patchedShots = () =>
  apiMock.mock.calls
    .filter(([, init]) => (init as RequestInit)?.method === 'PATCH')
    .map(([path]) => String(path))

function renderRunner() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return renderHook(() => useBatchRun(), {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children),
  })
}

beforeEach(() => {
  apiMock.mockReset()
  resetBatchRun()
})

describe('collectBatchWork', () => {
  it('collects every payable beat of every film, in film-then-beat order', () => {
    const work = collectBatchWork([film('f1'), film('f2')])
    expect(work.map((item) => item.shot.id)).toEqual(['f1-b0', 'f1-b1', 'f2-b0', 'f2-b1'])
  })

  it('leaves out free title cards — they have no model and cost nothing', () => {
    expect(collectBatchWork([film('f1')]).some((item) => item.shot.id.endsWith('title'))).toBe(false)
  })

  it('leaves out a beat that ALREADY cites a generation', () => {
    // The double-charge rule. A clip that exists is never re-run by the batch;
    // re-rolling one beat is a per-item act with its own price on its own button.
    const done = film('f1')
    const detail: FilmDetail = {
      ...done,
      shots: done.shots.map((one) => (one.id === 'f1-b0' ? { ...one, generationId: 'g-old' } : one)),
    }
    expect(collectBatchWork([detail]).map((item) => item.shot.id)).toEqual(['f1-b1'])
  })
})

describe('useBatchRun', () => {
  it('submits every payable beat and links each clip to its shot', async () => {
    mockRuns(() => ({ status: 'succeeded' }))
    const { result } = renderRunner()
    await act(async () => {
      await result.current.start([film('f1'), film('f2')], [TIER_MODEL])
    })
    expect(postBodies()).toHaveLength(4)
    expect(patchedShots().sort()).toEqual([
      '/api/films/f1/shots/f1-b0',
      '/api/films/f1/shots/f1-b1',
      '/api/films/f2/shots/f2-b0',
      '/api/films/f2/shots/f2-b1',
    ])
    expect(result.current.state.status).toBe('done')
  })

  it('composes each submit from the shot, at the tier model and the film aspect', async () => {
    mockRuns(() => ({ status: 'succeeded' }))
    const { result } = renderRunner()
    await act(async () => {
      await result.current.start([film('f1', 1)], [TIER_MODEL])
    })
    expect(postBodies()[0]).toMatchObject({
      modelId: TIER_MODEL.id,
      prompt: 'a fox crosses the street',
      aspectRatio: '9:16',
      duration: 8,
    })
  })

  it('never has more than four submits in flight', async () => {
    // ADR §7. Twenty clips would consume the entire 300/min global budget on
    // polling alone, and every submit spends provider money.
    const probe = mockRuns(() => ({ status: 'succeeded' }))
    const { result } = renderRunner()
    const films = ['f1', 'f2', 'f3', 'f4', 'f5'].map((id) => film(id, 3))
    await act(async () => {
      await result.current.start(films, [TIER_MODEL])
    })
    expect(probe.submits()).toBe(15)
    expect(probe.peakInFlight()).toBeLessThanOrEqual(MAX_IN_FLIGHT)
  })

  it('runs the beats in PARALLEL rather than one at a time', async () => {
    // The counterpart to the cap: beats are independent, so a batch that never
    // reached two in flight would be the sequential runner this one replaced.
    const probe = mockRuns(() => ({ status: 'succeeded' }))
    const { result } = renderRunner()
    await act(async () => {
      await result.current.start([film('f1', 4)], [TIER_MODEL])
    })
    expect(probe.peakInFlight()).toBeGreaterThan(1)
  })

  it('does not abort the batch when ONE beat fails upstream', async () => {
    const probe = mockRuns((index) =>
      index === 2 ? { status: 'failed', errorCode: 'content_blocked' } : { status: 'succeeded' },
    )
    const { result } = renderRunner()
    await act(async () => {
      await result.current.start([film('f1', 4)], [TIER_MODEL])
    })
    expect(probe.submits()).toBe(4)
    expect(result.current.state.status).toBe('done')
    expect(result.current.state.items.filter((item) => item.status === 'failed')).toHaveLength(1)
  })

  it('does not abort the batch when ONE submit is REFUSED', async () => {
    // A refused submit never created a generation row, so nothing is refunded
    // and nothing can be polled — the code is recorded against that beat alone.
    const probe = mockRuns((index) =>
      index === 2 ? new ApiClientError('content_blocked', 'blocked', 422) : { status: 'succeeded' },
    )
    const { result } = renderRunner()
    await act(async () => {
      await result.current.start([film('f1', 4)], [TIER_MODEL])
    })
    expect(probe.submits()).toBe(4)
    const failures = result.current.state.items.filter((item) => item.errorCode !== null)
    expect(failures).toHaveLength(1)
    expect(failures[0]?.errorCode).toBe('content_blocked')
    // The healthy beats are untouched — one rejection must never paint over them.
    expect(result.current.state.items.filter((item) => item.status === 'done')).toHaveLength(3)
  })

  it('never retries a terminal submit failure', async () => {
    // insufficient_credits, content_blocked and validation_failed are actionable:
    // repeating them cannot help, and one of them would re-cost the attempt.
    const probe = mockRuns(() => new ApiClientError('insufficient_credits', 'no', 402))
    const { result } = renderRunner()
    await act(async () => {
      await result.current.start([film('f1', 1)], [TIER_MODEL])
    })
    expect(probe.submits()).toBe(1)
    expect(result.current.state.items[0]?.errorCode).toBe('insufficient_credits')
  })

  it('retries a transient submit failure, then succeeds', async () => {
    const probe = mockRuns((index) =>
      index === 1 ? new ApiClientError('rate_limited', 'slow down', 429) : { status: 'succeeded' },
    )
    const { result } = renderRunner()
    await act(async () => {
      await result.current.start([film('f1', 1)], [TIER_MODEL])
    })
    expect(probe.submits()).toBe(2)
    expect(result.current.state.items[0]?.status).toBe('done')
  })

  it('cancel() stops the run BEFORE the next beat is charged', async () => {
    const { result } = renderRunner()
    // Cancel from inside the first poll: after the first wave of submits and
    // before any worker can pick up another beat. Already-submitted clips still
    // settle server-side; what must not happen is a NEW charge.
    apiMock.mockImplementation((path: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      if (method === 'POST') {
        return Promise.resolve({ id: 'g1', status: 'processing', mediaUrls: [] } as unknown as never)
      }
      if (method === 'PATCH') return Promise.resolve({ id: 'patched' } as unknown as never)
      result.current.cancel()
      return Promise.resolve({
        id: path.split('/').pop(),
        status: 'succeeded',
        mediaUrls: [],
      } as unknown as never)
    })
    await act(async () => {
      await result.current.start([film('f1', 12)], [TIER_MODEL])
    })
    // At most one beat per worker slot got as far as a submit; nothing after.
    expect(postBodies().length).toBeLessThanOrEqual(MAX_IN_FLIGHT)
    expect(result.current.state.status).toBe('cancelled')
  })

  it('refuses to start a second run while one is in flight', async () => {
    // Two overlapping runs would interleave submits and make the total the user
    // confirmed meaningless — the same guard the Canvas run pill has.
    const probe = mockRuns(() => ({ status: 'succeeded' }))
    const { result } = renderRunner()
    await act(async () => {
      const first = result.current.start([film('f1', 4)], [TIER_MODEL])
      const second = result.current.start([film('f2', 4)], [TIER_MODEL])
      await Promise.all([first, second])
    })
    expect(probe.submits()).toBe(4)
  })

  it('does nothing at all when there is no payable beat', async () => {
    const probe = mockRuns(() => ({ status: 'succeeded' }))
    const { result } = renderRunner()
    await act(async () => {
      await result.current.start([film('f1', 0)], [TIER_MODEL])
    })
    expect(probe.submits()).toBe(0)
    expect(result.current.state.status).toBe('idle')
  })

  it('retryBeat re-submits exactly one beat and leaves the rest alone', async () => {
    const probe = mockRuns((index) =>
      index === 1 ? { status: 'failed', errorCode: 'provider_error' } : { status: 'succeeded' },
    )
    const { result } = renderRunner()
    const one = film('f1', 2)
    await act(async () => {
      await result.current.start([one], [TIER_MODEL])
    })
    expect(probe.submits()).toBe(2)
    const beat = one.shots[1]
    if (!beat) throw new Error('fixture has no first beat')
    await act(async () => {
      await result.current.retryBeat(beat, TIER_MODEL, '9:16')
    })
    expect(probe.submits()).toBe(3)
    expect(result.current.state.items.find((item) => item.shotId === 'f1-b0')?.status).toBe('done')
  })
})
