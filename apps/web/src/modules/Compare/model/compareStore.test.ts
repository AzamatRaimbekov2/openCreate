// Behavior tests for the /compare store: parallel fan-out, INDEPENDENT panel
// settlement (one failure never darkens the others), single-provider retry and
// full reset. runCompareProvider is mocked — the store's job is orchestration,
// the wire behavior is the providers module's own concern.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCompareStore } from './compareStore'
import { runCompareProvider } from './providers'
import type { CompareProviderId } from './types'

vi.mock('./providers', async (importOriginal) => {
  const original = await importOriginal<typeof import('./providers')>()
  return { ...original, runCompareProvider: vi.fn() }
})

const mockRun = vi.mocked(runCompareProvider)

// Default script: every contender succeeds with a recognizable URL.
const successFor = (id: CompareProviderId) =>
  ({ status: 'success', imageUrl: `https://img.test/${id}.png`, durationMs: 1000 }) as const

beforeEach(() => {
  vi.clearAllMocks()
  useCompareStore.getState().reset()
})

describe('useCompareStore', () => {
  it('starts empty: no prompt, all panels empty, not generating', () => {
    const state = useCompareStore.getState()
    expect(state.prompt).toBe('')
    expect(state.isGenerating).toBe(false)
    expect(state.results['flux-dev'].status).toBe('empty')
    expect(state.results['nano-banana-pro'].status).toBe('empty')
    expect(state.results['qwen-image-max'].status).toBe('empty')
  })

  it('generateAll runs every contender in parallel and settles all panels', async () => {
    mockRun.mockImplementation(async (id) => successFor(id))
    const store = useCompareStore.getState()
    store.setPrompt('a cat')

    await useCompareStore.getState().generateAll()

    expect(mockRun).toHaveBeenCalledTimes(3)
    // Every call carries the SAME prompt and an AbortSignal
    for (const call of mockRun.mock.calls) {
      expect(call[1]).toBe('a cat')
      expect(call[2]).toBeInstanceOf(AbortSignal)
    }
    const { results, isGenerating } = useCompareStore.getState()
    expect(isGenerating).toBe(false)
    expect(results['flux-dev'].imageUrl).toBe('https://img.test/flux-dev.png')
    expect(results['nano-banana-pro'].imageUrl).toBe('https://img.test/nano-banana-pro.png')
    expect(results['qwen-image-max'].imageUrl).toBe('https://img.test/qwen-image-max.png')
  })

  it('one contender failing leaves the others successful (independent panels)', async () => {
    mockRun.mockImplementation(async (id) =>
      id === 'qwen-image-max' ? { status: 'error', error: 'Rate limited' } : successFor(id),
    )
    useCompareStore.getState().setPrompt('a cat')

    await useCompareStore.getState().generateAll()

    const { results } = useCompareStore.getState()
    expect(results['qwen-image-max']).toEqual({ status: 'error', error: 'Rate limited' })
    expect(results['flux-dev'].status).toBe('success')
    expect(results['nano-banana-pro'].status).toBe('success')
  })

  it('does nothing on an empty or whitespace prompt', async () => {
    useCompareStore.getState().setPrompt('   ')
    await useCompareStore.getState().generateAll()
    expect(mockRun).not.toHaveBeenCalled()
    expect(useCompareStore.getState().isGenerating).toBe(false)
  })

  it('retry re-runs ONLY the requested contender', async () => {
    mockRun.mockImplementation(async (id) => successFor(id))
    useCompareStore.getState().setPrompt('a cat')
    await useCompareStore.getState().generateAll()
    mockRun.mockClear()

    await useCompareStore.getState().retry('qwen-image-max')

    expect(mockRun).toHaveBeenCalledTimes(1)
    expect(mockRun.mock.calls[0]?.[0]).toBe('qwen-image-max')
    // The other panels' results survived untouched
    const { results } = useCompareStore.getState()
    expect(results['flux-dev'].status).toBe('success')
    expect(results['nano-banana-pro'].status).toBe('success')
  })

  it('reset clears prompt and every panel back to empty', async () => {
    mockRun.mockImplementation(async (id) => successFor(id))
    useCompareStore.getState().setPrompt('a cat')
    await useCompareStore.getState().generateAll()

    useCompareStore.getState().reset()

    const state = useCompareStore.getState()
    expect(state.prompt).toBe('')
    expect(state.results['flux-dev'].status).toBe('empty')
    expect(state.results['qwen-image-max'].status).toBe('empty')
    expect(state.isGenerating).toBe(false)
  })

  it('a stale run aborted by reset cannot overwrite the cleared panels', async () => {
    // Script a contender that only resolves AFTER reset has aborted the run.
    let release: ((value: ReturnType<typeof successFor>) => void) | undefined
    mockRun.mockImplementation(
      (id) =>
        new Promise((resolve) => {
          if (id === 'flux-dev') release = (v) => resolve(v)
          else resolve(successFor(id))
        }),
    )
    useCompareStore.getState().setPrompt('a cat')
    const run = useCompareStore.getState().generateAll()

    useCompareStore.getState().reset()
    release?.(successFor('flux-dev'))
    await run

    // The late result was dropped — the panel stays empty after reset.
    expect(useCompareStore.getState().results['flux-dev'].status).toBe('empty')
  })
})
