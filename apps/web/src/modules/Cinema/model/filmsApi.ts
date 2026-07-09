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
    onSuccess: (_film, { filmId }) => {
      // The list card (title/aspect) and the editor header both read stale copies
      void queryClient.invalidateQueries({ queryKey: ['films'] })
      void queryClient.invalidateQueries({ queryKey: filmKey(filmId) })
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
