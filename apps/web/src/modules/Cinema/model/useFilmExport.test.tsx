// apps/web/src/modules/Cinema/model/useFilmExport.test.tsx
// The export UI state machine (ADR: client-side-export). The REAL pipeline is
// browser-only (WebCodecs), so the hook takes an injected `run` seam: the tests
// drive the button → pipeline → progress → done/error/cancel transitions with a
// fake runner, in jsdom, without WebCodecs.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { FilmDetail, Shot } from '@opencreate/contracts'
import { useFilmExport } from './useFilmExport'

function makeShot(overrides: Partial<Shot>): Shot {
  return {
    id: 'a',
    filmId: 'film1',
    orderIndex: 1,
    generationId: 'gen-a',
    prompt: '',
    promptPreset: null,
    entityRefs: [],
    referenceImages: [],
    modelId: null,
    durationMs: 2000,
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

const film: FilmDetail = {
  film: {
    id: 'film1',
    title: 'Neon Drift',
    aspectRatio: '16:9',
    defaultStyleId: null,
    templateId: null,
    coverUrl: null,
    createdAt: '2026-07-23T10:00:00.000Z',
    updatedAt: '2026-07-23T10:00:00.000Z',
  },
  shots: [makeShot({ id: 'a' })],
  audio: [],
  latestRender: null,
}

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useFilmExport', () => {
  it('exposes support from the capability gate (unsupported in jsdom)', () => {
    const { result } = renderHook(() => useFilmExport(film, vi.fn()), { wrapper })
    expect(result.current.isSupported).toBe(false)
    expect(result.current.state).toBe('idle')
  })

  it('runs the pipeline, streaming progress, ending done', async () => {
    const run = vi.fn(async (_args, onProgress: (n: number) => void) => {
      onProgress(40)
      onProgress(100)
      return null // streamed to disk → no download
    })
    const { result } = renderHook(() => useFilmExport(film, run), { wrapper })

    await act(async () => {
      await result.current.startExport()
    })

    expect(run).toHaveBeenCalledTimes(1)
    expect(result.current.progress).toBe(100)
    expect(result.current.state).toBe('done')
  })

  it('surfaces a failure as an error state (never a crash)', async () => {
    const run = vi.fn(async () => {
      throw new Error('encoder died')
    })
    const { result } = renderHook(() => useFilmExport(film, run), { wrapper })

    await act(async () => {
      await result.current.startExport()
    })

    expect(result.current.state).toBe('error')
    expect(result.current.error).toBeTruthy()
  })

  it('cancel aborts the run and returns to idle (not error)', async () => {
    const run = vi.fn(
      (_args, _onProgress: (n: number) => void, signal: AbortSignal) =>
        new Promise<Blob | null>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        }),
    )
    const { result } = renderHook(() => useFilmExport(film, run), { wrapper })

    act(() => {
      void result.current.startExport()
    })
    await waitFor(() => expect(result.current.state).toBe('running'))

    await act(async () => {
      result.current.cancel()
      await Promise.resolve()
    })

    await waitFor(() => expect(result.current.state).toBe('idle'))
    expect(result.current.state).not.toBe('error')
  })
})
