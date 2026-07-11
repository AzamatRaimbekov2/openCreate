// apps/web/src/modules/Templates/model/templatesApi.ts
// Server state for the template catalog: read the gallery, and instantiate a film
// from a template.
//
// ADR: docs/wiki/decisions/template-catalog.md
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  CreateFilmFromTemplateInput,
  FilmDetail,
  TemplateList,
  TemplateSummary,
} from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'

// The gallery. Like ['catalog'], it is computed from two in-process server
// constants (the template registry × the model catalog) and changes only with an
// API deploy — so one fetch per session, no refetch, no cards reordering under a
// user who is mid-decision.
export function useTemplates() {
  return useQuery({
    queryKey: ['templates'],
    queryFn: () => api<TemplateList>('/api/templates'),
    staleTime: Infinity,
  })
}

// Read a single template out of the list cache. Used by the film editor to
// recover the music prompt of the template a film came from — a lookup, not a
// second request.
export function useTemplate(templateId: string | null): TemplateSummary | undefined {
  const { data } = useTemplates()
  if (!templateId) return undefined
  return data?.items.find((t) => t.id === templateId)
}

// Instantiate. One POST creates the film AND all its shots, and charges nothing —
// every shot lands as a draft with its prompt, preset, model, duration and spoken
// line filled in. The credits are spent later, per shot, by a user who has now
// seen what they are paying for.
//
// The response is the full FilmDetail, so we SEED ['film', id] with it rather
// than invalidating: the user is about to be navigated into that editor, and
// seeding means they land on a built timeline instead of a skeleton that resolves
// a moment later. ['films'] is invalidated because the library list is now stale.
//
// ['me'] is deliberately NOT touched: nothing was charged. Refreshing the balance
// here would make the action look like it cost something.
export function useCreateFilmFromTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateFilmFromTemplateInput) =>
      api<FilmDetail>('/api/films/from-template', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: (detail) => {
      queryClient.setQueryData(['film', detail.film.id], detail)
      void queryClient.invalidateQueries({ queryKey: ['films'] })
    },
  })
}

// The caller's credit balance, read from the SAME ['me'] cache entry Auth and
// Credits use — the established cross-module seam (a shared cache key, never an
// import). The detail modal needs it to say "you cannot afford this tier" BEFORE
// the user commits, rather than letting them build a film they can't generate.
export type Me = { creditsBalance: number }

export function useBalance() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api<Me>('/api/me'),
    staleTime: 30_000,
  })
}
