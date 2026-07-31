// apps/web/src/modules/Styles/model/api.test.tsx
// Behavior of the Style Studio data layer. Load-bearing assertions:
//   * the list is ONE query key (['styles']) — builtin + own arrive together;
//   * every write ABSORBS its answer into that cache instead of refetching, and
//     an unloaded cache is left alone (never fabricated from a single write);
//   * a preview is an ordinary paid generation: submit → poll → cite, and the
//     citation only happens when the run actually succeeded.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { Generation, Style } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'
import {
  PREVIEW_FALLBACK_MODEL_ID,
  STYLE_PREVIEW_PROMPT,
  useCreateStyle,
  useDeleteStyle,
  useStylePreview,
  useStyles,
  useUpdateStyle,
} from './api'

vi.mock('shared/libs/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared/libs/apiClient')>()
  return { ...actual, api: vi.fn() }
})

const apiMock = vi.mocked(api)

function styleRow(overrides: Partial<Style> = {}): Style {
  return {
    id: 'st1',
    name: 'Неоновый нуар',
    kind: 'prompt',
    builtin: false,
    fragment: 'neon noir, rain-slicked streets',
    negative: 'daylight',
    recommendedModelId: null,
    previewUrl: null,
    referenceImages: [],
    createdAt: '2026-07-31T10:00:00.000Z',
    updatedAt: '2026-07-31T10:00:00.000Z',
    ...overrides,
  }
}

function generationRow(overrides: Partial<Generation> = {}): Generation {
  return {
    id: 'gen1',
    type: 'image',
    mode: 'text',
    status: 'processing',
    prompt: STYLE_PREVIEW_PROMPT,
    modelId: PREVIEW_FALLBACK_MODEL_ID,
    params: { aspectRatio: '1:1' },
    costCredits: 1,
    mediaUrls: [],
    errorMessage: null,
    createdAt: '2026-07-31T10:00:00.000Z',
    completedAt: null,
    ...overrides,
  }
}

function harness() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { queryClient, wrapper }
}

beforeEach(() => {
  apiMock.mockReset()
})

describe('useStyles', () => {
  it('reads the registry as one list — builtin and own together', async () => {
    const builtin = styleRow({
      id: 'anime',
      name: 'Аниме',
      builtin: true,
      createdAt: null,
      updatedAt: null,
    })
    apiMock.mockResolvedValue({ items: [builtin, styleRow()] })
    const { wrapper } = harness()

    const { result } = renderHook(() => useStyles(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiMock).toHaveBeenCalledWith('/api/styles')
    expect(result.current.data?.items.map((style) => style.id)).toEqual(['anime', 'st1'])
  })
})

describe('style writes absorb their answer', () => {
  it('appends a created style without a refetch', async () => {
    const { queryClient, wrapper } = harness()
    queryClient.setQueryData(['styles'], { items: [styleRow({ id: 'old' })] })
    apiMock.mockResolvedValue(styleRow({ id: 'new' }))

    const { result } = renderHook(() => useCreateStyle(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({
        name: 'Неоновый нуар',
        fragment: 'neon noir',
        negative: '',
      })
    })

    expect(apiMock).toHaveBeenCalledTimes(1)
    expect(
      queryClient.getQueryData<{ items: Style[] }>(['styles'])?.items.map((style) => style.id),
    ).toEqual(['old', 'new'])
  })

  it('leaves an unloaded list alone instead of fabricating a one-item registry', async () => {
    const { queryClient, wrapper } = harness()
    apiMock.mockResolvedValue(styleRow({ id: 'new' }))

    const { result } = renderHook(() => useCreateStyle(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ name: 'X', fragment: 'y', negative: '' })
    })

    expect(queryClient.getQueryData(['styles'])).toBeUndefined()
  })

  it('replaces an updated style in place', async () => {
    const { queryClient, wrapper } = harness()
    queryClient.setQueryData(['styles'], { items: [styleRow(), styleRow({ id: 'st2' })] })
    apiMock.mockResolvedValue(styleRow({ name: 'Переименован' }))

    const { result } = renderHook(() => useUpdateStyle(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ id: 'st1', input: { name: 'Переименован' } })
    })

    const items = queryClient.getQueryData<{ items: Style[] }>(['styles'])?.items
    expect(items?.map((style) => style.id)).toEqual(['st1', 'st2'])
    expect(items?.[0]?.name).toBe('Переименован')
  })

  it('drops a deleted style from the list', async () => {
    const { queryClient, wrapper } = harness()
    queryClient.setQueryData(['styles'], { items: [styleRow(), styleRow({ id: 'st2' })] })
    apiMock.mockResolvedValue(undefined)

    const { result } = renderHook(() => useDeleteStyle(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync('st1')
    })

    expect(apiMock).toHaveBeenCalledWith('/api/styles/st1', { method: 'DELETE' })
    expect(
      queryClient.getQueryData<{ items: Style[] }>(['styles'])?.items.map((style) => style.id),
    ).toEqual(['st2'])
  })
})

describe('useStylePreview', () => {
  it('submits a neutral scene on the style itself and cites the run once it succeeds', async () => {
    const { wrapper } = harness()
    apiMock
      // POST /api/generations
      .mockResolvedValueOnce(generationRow())
      // the first poll already answers succeeded
      .mockResolvedValueOnce(generationRow({ status: 'succeeded', mediaUrls: ['/media/a.png'] }))
      // PATCH /api/styles/st1
      .mockResolvedValueOnce(styleRow({ previewUrl: '/media/a.png' }))

    const { result } = renderHook(() => useStylePreview(), { wrapper })
    act(() => result.current.start(styleRow({ recommendedModelId: 'flux-dev' })))

    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith('/api/styles/st1', {
        method: 'PATCH',
        body: JSON.stringify({ previewGenerationId: 'gen1' }),
      }),
    )
    // The submit rides the style's own recommendation and cites its own id
    expect(apiMock).toHaveBeenNthCalledWith(1, '/api/generations', {
      method: 'POST',
      body: JSON.stringify({
        modelId: 'flux-dev',
        prompt: STYLE_PREVIEW_PROMPT,
        promptPreset: { styleId: 'st1' },
        aspectRatio: '1:1',
      }),
    })
  })

  it('falls back to the cheapest image model when the style recommends none', async () => {
    const { wrapper } = harness()
    apiMock.mockResolvedValue(generationRow())

    const { result } = renderHook(() => useStylePreview(), { wrapper })
    act(() => result.current.start(styleRow({ recommendedModelId: null })))

    await waitFor(() => expect(apiMock).toHaveBeenCalled())
    expect(String(apiMock.mock.calls[0]?.[1]?.body)).toContain(
      `"modelId":"${PREVIEW_FALLBACK_MODEL_ID}"`,
    )
  })

  it('cites nothing when the preview run fails', async () => {
    const { wrapper } = harness()
    apiMock
      .mockResolvedValueOnce(generationRow())
      .mockResolvedValueOnce(generationRow({ status: 'failed', errorMessage: 'nope' }))

    const { result } = renderHook(() => useStylePreview(), { wrapper })
    act(() => result.current.start(styleRow()))

    // The poll must actually have run — otherwise "no PATCH" proves nothing
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/api/generations/gen1'))
    await waitFor(() => expect(result.current.pendingStyleId).toBeNull())
    expect(apiMock.mock.calls.some(([path]) => String(path).startsWith('/api/styles/'))).toBe(false)
  })
})
