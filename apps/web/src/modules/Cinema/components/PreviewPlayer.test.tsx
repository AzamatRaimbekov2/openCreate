// apps/web/src/modules/Cinema/components/PreviewPlayer.test.tsx
// The preview is PLAYHEAD-DRIVEN (NLE Phase 1): it shows whatever clip the
// timeline clock's playhead sits on, seeks the <video> to the offset within that
// clip, and plays via a requestAnimationFrame loop that MUST be cancelled on
// unmount. These pin the two behaviours the ADR calls out — the preview follows
// selection/seek, and the rAF loop never leaks.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import type { Generation, Shot } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'
import { PreviewPlayer } from './PreviewPlayer'
import { useTimelineClock } from '../model/timelineClock'
import 'shared/config/i18n'

vi.mock('shared/libs/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared/libs/apiClient')>()
  return { ...actual, api: vi.fn() }
})

const apiMock = vi.mocked(api)

// jsdom does not persist media currentTime and leaves play/pause unimplemented.
// Install a working accessor + stubs so the component's REAL seek/transport logic
// can run and be read back (we are not mocking the component, only the platform).
const currentTimeStore = new WeakMap<HTMLMediaElement, number>()
beforeAll(() => {
  Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
    configurable: true,
    get(this: HTMLMediaElement) {
      return currentTimeStore.get(this) ?? 0
    },
    set(this: HTMLMediaElement, value: number) {
      currentTimeStore.set(this, value)
    },
  })
  HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve())
  HTMLMediaElement.prototype.pause = vi.fn()
})

function makeShot(overrides: Partial<Shot>): Shot {
  return {
    id: 'shot1',
    filmId: 'film1',
    orderIndex: 1,
    generationId: null,
    prompt: '',
    promptPreset: null,
    entityRefs: [],
    referenceImages: [],
    modelId: null,
    aspectRatio: null,
    durationMs: 4000,
    trimStartMs: 0,
    transition: 'none',
    transitionMs: 0,
    title: null,
    voiceover: null,
    audio: false,
    createdAt: '2026-07-22T10:00:00.000Z',
    ...overrides,
  }
}

function makeVideoGeneration(id: string, url: string): Generation {
  return {
    id,
    type: 'video',
    mode: 'text',
    status: 'succeeded',
    prompt: 'x',
    modelId: 'wan-2-7',
    params: {},
    costCredits: 85,
    mediaUrls: [url],
    errorMessage: null,
    createdAt: '2026-07-22T10:00:00.000Z',
    completedAt: '2026-07-22T10:00:30.000Z',
  }
}

function renderPreview(shots: Shot[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <PreviewPlayer shots={shots} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  apiMock.mockReset()
  useTimelineClock.getState().reset()
})

describe('PreviewPlayer — playhead driven', () => {
  it('shows the clip the playhead is resting on, not the first shot', async () => {
    // Two video clips: a [0,4000), b [4000,9000). The playhead sits inside b.
    apiMock.mockImplementation((path: string) => {
      if (path === '/api/generations/gen-a') return Promise.resolve(makeVideoGeneration('gen-a', '/media/a.mp4'))
      if (path === '/api/generations/gen-b') return Promise.resolve(makeVideoGeneration('gen-b', '/media/b.mp4'))
      return Promise.reject(new Error(`unexpected ${path}`))
    })
    const { container } = renderPreview([
      makeShot({ id: 'a', generationId: 'gen-a', durationMs: 4000 }),
      makeShot({ id: 'b', generationId: 'gen-b', durationMs: 5000 }),
    ])

    act(() => useTimelineClock.getState().seek(5000, 9000))

    // The mounted <video> is clip b's media, because the playhead is on b.
    await waitFor(() => {
      const video = container.querySelector('video')
      expect(video?.getAttribute('src')).toBe('/media/b.mp4')
    })
  })

  it('seeks the video to the offset within the current clip', async () => {
    apiMock.mockResolvedValue(makeVideoGeneration('gen-a', '/media/a.mp4'))
    const { container } = renderPreview([makeShot({ id: 'a', generationId: 'gen-a', durationMs: 10_000 })])

    // Wait for the video to mount, then seek 3s into the single clip.
    await waitFor(() => expect(container.querySelector('video')).not.toBeNull())
    act(() => useTimelineClock.getState().seek(3000, 10_000))

    await waitFor(() => {
      const video = container.querySelector('video') as HTMLVideoElement
      expect(video.currentTime).toBe(3)
    })
  })

  it('unmutes the playing clip and re-mutes it on pause (sound on play)', async () => {
    apiMock.mockResolvedValue(makeVideoGeneration('gen-a', '/media/a.mp4'))
    const { container } = renderPreview([makeShot({ id: 'a', generationId: 'gen-a', durationMs: 10_000 })])

    await waitFor(() => expect(container.querySelector('video')).not.toBeNull())
    const video = container.querySelector('video') as HTMLVideoElement

    // Paused = silent: scrubbing must not blast audio, and it satisfies autoplay.
    expect(video.muted).toBe(true)
    act(() => useTimelineClock.getState().play())
    expect(video.muted).toBe(false)
    act(() => useTimelineClock.getState().pause())
    expect(video.muted).toBe(true)
  })

  it('advances the playhead while playing and cancels its frame loop on unmount', () => {
    const frames: FrameRequestCallback[] = []
    const rafSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((cb: FrameRequestCallback) => frames.push(cb))
    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)

    const { unmount } = renderPreview([makeShot({ id: 'a', generationId: null, durationMs: 10_000 })])

    act(() => useTimelineClock.getState().play())
    // The loop registered a frame the moment playback started.
    expect(rafSpy).toHaveBeenCalled()

    // Drive two frames (t=0, then t=500ms) — the playhead advances by real elapsed.
    act(() => frames[frames.length - 1]?.(0))
    act(() => frames[frames.length - 1]?.(500))
    expect(useTimelineClock.getState().playheadMs).toBeGreaterThanOrEqual(500)

    unmount()
    // The #1 review risk: no dangling rAF after the component is gone.
    expect(cancelSpy).toHaveBeenCalled()

    rafSpy.mockRestore()
    cancelSpy.mockRestore()
  })
})
