// apps/web/src/modules/Cinema/model/filmsApi.test.tsx
// Pins how a film UPDATE lands in the cache. PATCH answers with the whole Film,
// so the two places that render one are written from that answer rather than
// refetched — the library card and the editor's composite detail. Refetching
// would discard a response we already hold and put a visible gap between saving
// a cover and seeing it (the absorb discipline the Creator and Styles modules
// document).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { Film, FilmDetail, FilmList } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'
import { filmKey, useUpdateFilm } from './filmsApi'

vi.mock('shared/libs/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared/libs/apiClient')>()
  return { ...actual, api: vi.fn() }
})

const apiMock = vi.mocked(api)

function makeFilm(overrides: Partial<Film> = {}): Film {
  return {
    id: 'film1',
    title: 'Neon Drift',
    aspectRatio: '16:9',
    defaultStyleId: null,
    templateId: null,
    batchId: null,
    coverUrl: null,
    createdAt: '2026-08-02T10:00:00.000Z',
    updatedAt: '2026-08-02T10:00:00.000Z',
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

it('writes the answered film into the library list', async () => {
  const { queryClient, wrapper } = harness()
  queryClient.setQueryData<FilmList>(['films'], {
    items: [makeFilm(), makeFilm({ id: 'film2', title: 'Other' })],
  })
  apiMock.mockResolvedValue(makeFilm({ coverUrl: '/media/new.png' }))

  const { result } = renderHook(() => useUpdateFilm(), { wrapper })
  await act(async () => {
    await result.current.mutateAsync({ filmId: 'film1', input: { title: 'Neon Drift' } })
  })

  const items = queryClient.getQueryData<FilmList>(['films'])?.items
  // Replaced IN PLACE — reordering the shelf under a user who just renamed a
  // film moves the card they are looking at.
  expect(items?.map((film) => film.id)).toEqual(['film1', 'film2'])
  expect(items?.[0]?.coverUrl).toBe('/media/new.png')
})

it('writes it into the editor detail without disturbing shots or audio', async () => {
  const { queryClient, wrapper } = harness()
  const detail = {
    film: makeFilm(),
    shots: [{ id: 'shot1' }],
    audio: [{ id: 'track1' }],
  } as unknown as FilmDetail
  queryClient.setQueryData<FilmDetail>(filmKey('film1'), detail)
  apiMock.mockResolvedValue(makeFilm({ coverUrl: '/media/new.png' }))

  const { result } = renderHook(() => useUpdateFilm(), { wrapper })
  await act(async () => {
    await result.current.mutateAsync({ filmId: 'film1', input: { coverDataUri: null } })
  })

  const next = queryClient.getQueryData<FilmDetail>(filmKey('film1'))
  expect(next?.film.coverUrl).toBe('/media/new.png')
  // The timeline is not this mutation's business
  expect(next?.shots).toBe(detail.shots)
  expect(next?.audio).toBe(detail.audio)
})

it('leaves an unloaded cache alone rather than fabricating one', async () => {
  const { queryClient, wrapper } = harness()
  apiMock.mockResolvedValue(makeFilm())

  const { result } = renderHook(() => useUpdateFilm(), { wrapper })
  await act(async () => {
    await result.current.mutateAsync({ filmId: 'film1', input: { title: 'x' } })
  })

  await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(1))
  expect(queryClient.getQueryData(['films'])).toBeUndefined()
  expect(queryClient.getQueryData(filmKey('film1'))).toBeUndefined()
})
