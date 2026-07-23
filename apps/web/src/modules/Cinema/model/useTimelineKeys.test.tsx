// apps/web/src/modules/Cinema/model/useTimelineKeys.test.tsx
// Editor-scoped keyboard control (NLE Phase 4). The shortcuts drive the ONE
// timeline clock and the split mutation; the load-bearing rule is that they must
// NOT fire while the user is typing in the composer (or any text field). A tiny
// harness mounts the hook next to an <input> so both paths are exercised.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import type { Shot } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'
import { useTimelineKeys } from './useTimelineKeys'
import { useTimelineClock } from './timelineClock'
import 'shared/config/i18n'

vi.mock('shared/libs/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared/libs/apiClient')>()
  return { ...actual, api: vi.fn() }
})

const apiMock = vi.mocked(api)

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

// a [0,4000) · b [4000,10000); total 10000.
const shots = [makeShot({ id: 'a', durationMs: 4000 }), makeShot({ id: 'b', durationMs: 6000 })]

function Harness() {
  useTimelineKeys('film1', shots)
  return <input aria-label="composer" />
}

function mountKeys() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <Harness />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  apiMock.mockReset()
  useTimelineClock.getState().reset()
  // Nothing focused → document.body is the active element (an "editor" target).
  ;(document.activeElement as HTMLElement | null)?.blur?.()
})

describe('useTimelineKeys', () => {
  it('toggles play on Space', () => {
    mountKeys()
    fireEvent.keyDown(document.body, { key: ' ' })
    expect(useTimelineClock.getState().isPlaying).toBe(true)
    fireEvent.keyDown(document.body, { key: ' ' })
    expect(useTimelineClock.getState().isPlaying).toBe(false)
  })

  it('steps the playhead by a frame with the arrows, clamped to the film', () => {
    mountKeys()
    useTimelineClock.getState().seek(1000, 10_000)
    fireEvent.keyDown(document.body, { key: 'ArrowRight' })
    expect(useTimelineClock.getState().playheadMs).toBe(1033) // +1/30s
    useTimelineClock.getState().seek(0, 10_000)
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' })
    expect(useTimelineClock.getState().playheadMs).toBe(0) // clamped
  })

  it('jumps to the next / previous shot boundary with Shift+arrow', () => {
    mountKeys()
    useTimelineClock.getState().seek(2000, 10_000) // inside shot a
    fireEvent.keyDown(document.body, { key: 'ArrowRight', shiftKey: true })
    expect(useTimelineClock.getState().playheadMs).toBe(4000) // a→b boundary
    fireEvent.keyDown(document.body, { key: 'ArrowLeft', shiftKey: true })
    expect(useTimelineClock.getState().playheadMs).toBe(0)
  })

  it('seeks to the film start and end with Home / End', () => {
    mountKeys()
    useTimelineClock.getState().seek(5000, 10_000)
    fireEvent.keyDown(document.body, { key: 'Home' })
    expect(useTimelineClock.getState().playheadMs).toBe(0)
    fireEvent.keyDown(document.body, { key: 'End' })
    expect(useTimelineClock.getState().playheadMs).toBe(10_000)
  })

  it('does NOT fire while the user is typing in a text field', () => {
    mountKeys()
    const input = screen.getByLabelText('composer')
    input.focus()
    fireEvent.keyDown(input, { key: ' ' })
    expect(useTimelineClock.getState().isPlaying).toBe(false) // suppressed
  })

  it('splits the shot under the playhead on S', async () => {
    apiMock.mockResolvedValue({ film: {}, shots: [], audio: [], latestRender: null })
    mountKeys()
    useTimelineClock.getState().seek(6000, 10_000) // 2000 into shot b
    fireEvent.keyDown(document.body, { key: 's' })
    await vi.waitFor(() => {
      const call = apiMock.mock.calls.find(([path]) => path === '/api/films/film1/shots/b/split')
      expect(call).toBeDefined()
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({ atMs: 2000 })
    })
  })

  it('removes its keydown listener on unmount (no leak)', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = mountKeys()
    unmount()
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
    removeSpy.mockRestore()
  })
})
