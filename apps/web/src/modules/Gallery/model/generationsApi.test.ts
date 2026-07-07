// apps/web/src/modules/Gallery/model/generationsApi.test.ts
// Behavior of useLiveGeneration's polling budget and failure handling (QA
// findings 1-2): the 4s interval runs only within 20 minutes of createdAt
// (injected now() keeps the clock deterministic), then stops and reports
// isStalled; refresh() runs exactly one more poll; a failed FIRST poll (the
// card would otherwise sit at "Generating 0%" forever) surfaces isPollError,
// and refresh() restarts the query.
import { createElement, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { Generation } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'
import { GENERATION_STALL_MS, useLiveGeneration } from './generationsApi'

vi.mock('shared/libs/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared/libs/apiClient')>()
  return { ...actual, api: vi.fn() }
})

const apiMock = vi.mocked(api)

// The deterministic "creation moment" every test measures elapsed time from
const T0 = Date.parse('2026-07-06T10:00:00.000Z')

const processingSeed: Generation = {
  id: 'gen1',
  type: 'video',
  mode: 'text',
  status: 'processing',
  prompt: 'ocean waves at dusk',
  modelId: 'pixverse-v6',
  params: { aspectRatio: '9:16', duration: 5 },
  costCredits: 35,
  mediaUrls: [],
  progress: 40,
  errorMessage: null,
  createdAt: '2026-07-06T10:00:00.000Z',
  completedAt: null,
}

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
}

beforeEach(() => {
  apiMock.mockReset()
})

afterEach(() => {
  // Restore real timers BEFORE RTL's auto-cleanup unmounts hanging queries
  vi.useRealTimers()
})

describe('useLiveGeneration polling budget', () => {
  it('polls every 4s while processing within the 20-minute budget', async () => {
    vi.useFakeTimers()
    apiMock.mockResolvedValue(processingSeed)
    const { result } = renderHook(
      // 1 minute after creation — well inside the budget
      () => useLiveGeneration(processingSeed, { now: () => T0 + 60_000 }),
      { wrapper: createWrapper() },
    )
    // Flush the mount fetch (microtasks only — the mock resolves instantly)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(apiMock).toHaveBeenCalledTimes(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000)
    })
    expect(apiMock).toHaveBeenCalledTimes(2)
    expect(result.current.isStalled).toBe(false)
  })

  it('stops the interval and reports isStalled past 20 minutes since createdAt', async () => {
    vi.useFakeTimers()
    apiMock.mockResolvedValue(processingSeed)
    const { result } = renderHook(
      () => useLiveGeneration(processingSeed, { now: () => T0 + GENERATION_STALL_MS + 1 }),
      { wrapper: createWrapper() },
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    // The mount fetch still happens once (an honest status check on load)…
    expect(apiMock).toHaveBeenCalledTimes(1)
    // …but no interval follows: three would-be ticks later, still one call
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_000)
    })
    expect(apiMock).toHaveBeenCalledTimes(1)
    expect(result.current.isStalled).toBe(true)
    expect(result.current.isPollError).toBe(false)
  })

  it('refresh() runs exactly one more poll after stalling', async () => {
    vi.useFakeTimers()
    apiMock.mockResolvedValue(processingSeed)
    const { result } = renderHook(
      () => useLiveGeneration(processingSeed, { now: () => T0 + GENERATION_STALL_MS + 1 }),
      { wrapper: createWrapper() },
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(apiMock).toHaveBeenCalledTimes(1)
    act(() => {
      result.current.refresh()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    // One manual poll — and still no interval afterwards (budget stays spent)
    expect(apiMock).toHaveBeenCalledTimes(2)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_000)
    })
    expect(apiMock).toHaveBeenCalledTimes(2)
  })

  it('does not report stalled for a terminal seed', () => {
    const succeededSeed: Generation = {
      ...processingSeed,
      status: 'succeeded',
      mediaUrls: ['/media/gen1.mp4'],
    }
    const { result } = renderHook(
      () => useLiveGeneration(succeededSeed, { now: () => T0 + GENERATION_STALL_MS + 1 }),
      { wrapper: createWrapper() },
    )
    expect(result.current.isStalled).toBe(false)
    expect(apiMock).not.toHaveBeenCalled()
  })
})

describe('useLiveGeneration first-poll failure', () => {
  it('surfaces isPollError when the per-item GET rejects, and refresh() restarts the query', async () => {
    apiMock.mockRejectedValueOnce(new Error('network down'))
    const { result } = renderHook(
      () => useLiveGeneration(processingSeed, { now: () => T0 + 60_000 }),
      { wrapper: createWrapper() },
    )
    await waitFor(() => {
      expect(result.current.isPollError).toBe(true)
    })
    // The card still has the seed to render — never a blank state
    expect(result.current.generation).toEqual(processingSeed)
    expect(result.current.isStalled).toBe(false)
    // Retry restarts the query: the next answer clears the error
    apiMock.mockResolvedValue({ ...processingSeed, progress: 55 })
    act(() => {
      result.current.refresh()
    })
    await waitFor(() => {
      expect(result.current.isPollError).toBe(false)
    })
    expect(result.current.generation.progress).toBe(55)
  })
})
