// apps/web/src/modules/Shorts/model/batchApi.ts
// Server state for a shorts batch. Three calls and no fourth:
//
//   POST /api/films/from-template/batch  — N films + N×M draft shots, ZERO credits
//   GET  /api/films?batchId=…            — the films of one batch, after a reload
//   GET  /api/films/:id                  — each film's shots, through the SHARED
//                                          ['film', id] entry the Cinema editor uses
//
// There is deliberately NO batch-status endpoint. ADR shorts-studio §2: progress
// is derived from `shot.generationId`, and a status route would be a second
// source of truth about whether a clip exists — the row that already answers
// that question is the shot.
//
// THE RELOAD CHAIN, stated exactly, because the ADR's §2 originally got it wrong
// (corrected 2026-08-20). The board is NOT rebuilt from "films?batchId plus the
// ['generation', id] cache": that cache is client memory and is empty after a
// reload. The real chain is four hops, all of them server reads:
//
//   GET /api/films?batchId=…  →  each film's id
//   GET /api/films/:id        →  its shots
//   shot.generationId         →  the clip each beat cites
//   GET /api/generations/:id  →  that clip's live status
//
// The shared cache is what keeps the chain CHEAP once it has run — N watchers of
// one clip cost one poll — but it is never the source. A batch survives a reload
// because every one of those four hops is a row on disk.
//
// CROSS-MODULE SEAM: this module talks to Cinema's data without importing Cinema,
// through the query KEYS both of them use (['film', id], ['films'],
// ['generation', id]). That is the established discipline in this codebase — see
// Cinema's own index.ts header, and Templates' `useBalance` on ['me'].
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  CreateFilmsFromTemplateBatchInput,
  CreateFilmsFromTemplateBatchResult,
  FilmDetail,
  FilmList,
} from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'

// The composite cache key the Cinema editor hangs on. Re-declared rather than
// imported: a shared key is the seam, an import would be a coupling.
export function filmKey(filmId: string) {
  return ['film', filmId] as const
}

// Create the whole batch. ONE call, one transaction server-side, ZERO credits —
// every shot lands as a draft with its prompt, preset, model and duration filled
// in, exactly like the single-film path.
//
// ['me'] is deliberately NOT invalidated: nothing was charged, and refreshing the
// balance here would make the action look like it cost something. That is the
// same reasoning `useCreateFilmFromTemplate` documents, and it matters more here,
// because this is the screen where the user is about to agree to a large number.
//
// THERE IS NO PARTIAL SUCCESS. One bad row rejects the WHOLE request and writes
// nothing — no per-row error list to reconcile and no half-batch to clean up. The
// 400's message names the offending key, but it is prose and must never be
// parsed: per-row correctness is established BEFORE the POST, by validating each
// row against the template's own declared `variables` (see `isRowComplete`).
export function useCreateFilmBatch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateFilmsFromTemplateBatchInput) =>
      api<CreateFilmsFromTemplateBatchResult>('/api/films/from-template/batch', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: (result) => {
      // SEED every detail rather than invalidating. The run board renders from
      // ['film', id] and the runner reads each film's shots out of the same
      // entries; seeding means the board is built the moment the POST answers,
      // and the runner never waits on N refetches before its first submit.
      for (const detail of result.films) {
        queryClient.setQueryData(filmKey(detail.film.id), detail)
      }
      void queryClient.invalidateQueries({ queryKey: ['films'] })
    },
  })
}

// Hop 1 of the reload chain: the films of one batch. The API filters by OWNER
// and batch, so a leaked id addresses nothing outside its owner's library — and
// it answers 400 on a non-uuid rather than an empty list, which is the right
// answer: every batch id is server-minted, so a malformed one means the id got
// mangled, and an empty board would hide that behind "you have no shorts".
export function useBatchFilms(batchId: string | null) {
  return useQuery({
    queryKey: ['films', { batchId }],
    queryFn: () => api<FilmList>(`/api/films?batchId=${encodeURIComponent(batchId ?? '')}`),
    enabled: batchId !== null && batchId !== '',
  })
}

// Each film's shots, through the SAME ['film', id] entries the batch response
// seeded and the Cinema editor writes. After a fresh create these resolve from
// cache with no request at all; after a reload they fetch once each.
export function useBatchFilmDetails(filmIds: readonly string[]) {
  return useQueries({
    queries: filmIds.map((filmId) => ({
      queryKey: filmKey(filmId),
      queryFn: () => api<FilmDetail>(`/api/films/${filmId}`),
      // A batch of forty films seeded a moment ago must not immediately refetch
      // forty details — that is forty requests fired at the exact instant the
      // runner wants its rate budget (ADR §7). Nothing else changes a film here
      // either: the shot→generation link this module writes is ABSORBED into
      // this same entry, so the cache is not merely fresh, it is authoritative.
      staleTime: 30_000,
    })),
    combine: (results) => ({
      films: results.flatMap((result) => (result.data ? [result.data] : [])),
      // Pending only while something has NOTHING to show; a board with nine of
      // ten films must render those nine rather than a skeleton over all of them.
      isPending: results.length > 0 && results.every((result) => result.isPending),
      isError: results.some((result) => result.isError),
      refetch: () => {
        for (const result of results) void result.refetch()
      },
    }),
  })
}
