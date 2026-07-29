// The autosave loop: dirty → (1.5s quiet) → PATCH → saved; a failed PATCH →
// 'error' + retry keeps local state; unmount flushes a pending save.
// saveCanvas is mocked — the loop's behavior is the unit under test.
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCanvasStore } from './canvasStore'
import { AUTOSAVE_DEBOUNCE_MS, useCanvasAutosave } from './useCanvasDoc'
import { saveCanvas } from './api'

vi.mock('./api', async (importOriginal) => {
  const original = await importOriginal<typeof import('./api')>()
  return { ...original, saveCanvas: vi.fn() }
})
const mockSave = vi.mocked(saveCanvas)

const DOC = {
  id: 'c1',
  title: 'T',
  viewport: { x: 0, y: 0, zoom: 1 },
  nodes: [],
  edges: [],
  createdAt: '2026-07-30T00:00:00.000Z',
  updatedAt: '2026-07-30T00:00:00.000Z',
}

beforeEach(() => {
  vi.useFakeTimers()
  useCanvasStore.getState().reset()
  useCanvasStore.getState().init(DOC)
  mockSave.mockResolvedValue(DOC)
})
afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('useCanvasAutosave', () => {
  it('debounces: one PATCH after 1.5s of quiet, carrying the full document', async () => {
    const { unmount } = renderHook(() => useCanvasAutosave())
    act(() => {
      useCanvasStore.getState().addNode('note', { x: 1, y: 2 })
      useCanvasStore.getState().addNode('image', { x: 3, y: 4 })
    })
    expect(mockSave).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS + 10)
      await Promise.resolve()
    })
    expect(mockSave).toHaveBeenCalledTimes(1)
    const call = mockSave.mock.calls[0]
    expect(call?.[0]).toBe('c1')
    expect(call?.[1].nodes).toHaveLength(2)
    expect(useCanvasStore.getState().saveState).toBe('saved')
    unmount()
  })

  it('a failed PATCH flips to error and keeps the local doc', async () => {
    mockSave.mockRejectedValue(new Error('offline'))
    const { unmount } = renderHook(() => useCanvasAutosave())
    act(() => useCanvasStore.getState().addNode('note', { x: 1, y: 2 }))
    await act(async () => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS + 10)
      await Promise.resolve()
    })
    expect(useCanvasStore.getState().saveState).toBe('error')
    expect(useCanvasStore.getState().nodes).toHaveLength(1)
    unmount()
  })

  it('unmount flushes a pending save immediately', () => {
    const { unmount } = renderHook(() => useCanvasAutosave())
    act(() => useCanvasStore.getState().addNode('note', { x: 1, y: 2 }))
    expect(mockSave).not.toHaveBeenCalled()
    unmount()
    expect(mockSave).toHaveBeenCalledTimes(1)
  })
})
