// apps/web/src/modules/Cinema/model/filmsApi.ts
// Server-state hooks for films themselves: the library list (['films']), the
// editor's composite detail (['film', id] → film + ordered shots + audio), and
// the create/update/delete mutations. The detail key is the spine the whole
// editor hangs on — every shot/audio/reorder mutation invalidates or patches it.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  CreateFilmInput,
  Film,
  FilmDetail,
  FilmList,
  UpdateFilmInput,
} from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'

// The film's composite detail cache key — exported so sibling mutation hooks
// (shots/audio/renders/storyboard) target the exact same entry.
export function filmKey(filmId: string) {
  return ['film', filmId] as const
}

export function useFilms() {
  return useQuery({
    queryKey: ['films'],
    queryFn: () => api<FilmList>('/api/films'),
  })
}

export function useFilm(filmId: string) {
  return useQuery({
    queryKey: filmKey(filmId),
    queryFn: () => api<FilmDetail>(`/api/films/${filmId}`),
    // A missing/empty id (route param not yet resolved) must not fire a request
    enabled: filmId !== '',
  })
}

export function useCreateFilm() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateFilmInput) =>
      api<Film>('/api/films', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['films'] }),
  })
}

export function useUpdateFilm() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ filmId, input }: { filmId: string; input: UpdateFilmInput }) =>
      api<Film>(`/api/films/${filmId}`, { method: 'PATCH', body: JSON.stringify(input) }),
    // ABSORB the answer instead of refetching it. PATCH returns the whole Film,
    // so the two surfaces that render one are written from that response: the
    // library card and the editor's composite detail. Refetching would throw away
    // a row we are already holding and put a visible gap between saving a cover
    // and seeing it — the same discipline the Creator and Styles modules document.
    onSuccess: (film, { filmId }) => {
      // Replaced IN PLACE: reordering the shelf under someone who just renamed a
      // film moves the card they are looking at.
      queryClient.setQueryData<FilmList>(['films'], (old) =>
        old
          ? { ...old, items: old.items.map((row) => (row.id === film.id ? film : row)) }
          : old,
      )
      // The detail is a composite — only its `film` half is this mutation's
      // business; shots and audio are left exactly as they were.
      queryClient.setQueryData<FilmDetail>(filmKey(filmId), (old) =>
        old ? { ...old, film } : old,
      )
    },
  })
}

export function useDeleteFilm() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (filmId: string) => api<void>(`/api/films/${filmId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['films'] }),
  })
}
