// apps/web/src/modules/Assets3D/model/partGeneration.ts
// Live view of a part's cited generation (its extraction image or its mesh),
// keyed by id over the SHARED ['generation', id] cache — deduped with Gallery and
// Cinema, which read the same key. It COPIES Cinema's fetch-by-id precedent
// (shotGeneration.ts useShotGeneration/useShotGenerations), NOT Gallery's
// seed-from-list hook: an Assets3D part cites a generation by id ONLY
// (imageGenerationId/meshGenerationId), and the GET /assets3d/:id DTO embeds no
// Generation objects — so on a cold load/reload nothing populates
// ['generation', id]. The module MUST fetch each cited id itself to obtain
// `.status` and `mediaUrls[0]`.
//
// This module never imports Cinema/Gallery — the precedent is re-implemented here
// (the same discipline the ADR demands for the viewer's GLB loader). If this hook
// ever proves worth sharing, extract it to shared/ rather than cross-importing.
import { useEffect, useRef } from 'react'
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Generation } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'

// Poll cadence while a cited generation is still rendering upstream (4s — the same
// cadence Gallery/Cinema use, since they share the ['generation', id] key).
export const GENERATION_POLL_MS = 4000

// The poll-stop guard, extracted PURE so it is unit-testable with no WebGL and no
// network (the hook itself needs a QueryClient + fetch; the interesting logic does
// not). Keep polling only while the last answer is 'processing'; STOP on any
// terminal answer, and STOP on a FIRST-poll error (data still undefined) rather
// than hammering a failing endpoint every 4s. A failure AFTER data has arrived
// keeps polling — one network blip must not kill a live view that already has a
// processing answer. Mirrors Cinema's shotGeneration refetchInterval exactly.
export function partPollInterval(isError: boolean, data: Generation | undefined): number | false {
  if (isError && data === undefined) return false
  return data?.status === 'processing' ? GENERATION_POLL_MS : false
}

// One cited generation, polled to a terminal state. A null id (the part is not yet
// extracted/meshed) DISABLES the query and the card renders its pre-generation CTA.
// On a real processing → terminal transition it refreshes the shared feed and
// balance exactly once — an async mesh (202) that finishes after its request must
// update ['generations'] + ['me'] the way the Gallery live view does. A cold load
// of an ALREADY-terminal citation must NOT churn them, hence the wasProcessing gate.
export function useLivePartGeneration(generationId: string | null) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['generation', generationId ?? ''],
    queryFn: () => api<Generation>(`/api/generations/${generationId}`),
    enabled: generationId !== null,
    refetchInterval: (q) => partPollInterval(q.state.status === 'error', q.state.data),
  })

  // Latches (mutated ONLY inside the effect — never during render): the id we last
  // saw so a re-roll (new cited id) re-arms the refresh, whether we observed it
  // processing, and the id we already refreshed for so it fires at most once.
  const prevIdRef = useRef<string | null>(generationId)
  const wasProcessingRef = useRef(false)
  const invalidatedIdRef = useRef<string | null>(null)

  const status = query.data?.status
  useEffect(() => {
    // A re-roll cites a NEW generation → reset the processing latch so its own
    // terminal transition is allowed to refresh the feed/balance again.
    if (prevIdRef.current !== generationId) {
      prevIdRef.current = generationId
      wasProcessingRef.current = false
    }
    if (generationId === null) return
    // Remember we saw it processing so a later terminal answer is a real transition.
    if (status === 'processing') {
      wasProcessingRef.current = true
      return
    }
    // Fire once per id, only for a processing → terminal transition (an async mesh
    // finishing after its 202) — NOT a cold load of an already-terminal citation.
    if (status === undefined || !wasProcessingRef.current) return
    if (invalidatedIdRef.current === generationId) return
    invalidatedIdRef.current = generationId
    void queryClient.invalidateQueries({ queryKey: ['generations'] })
    void queryClient.invalidateQueries({ queryKey: ['me'] })
  }, [generationId, status, queryClient])

  return query
}

// Every cited generation at once — the Assembly stage resolves the whole set of
// mesh citations to build the scene, and any grid reads a batch of extractions.
// One query per id over the SHARED cache, deduped with the per-card
// useLivePartGeneration (which owns the polling); these carry no interval, they
// only READ the fresher answer. Returns a lookup keyed by id; the caller keeps
// ONLY rows whose generation is 'succeeded' (a still-processing/failed mesh has no
// playable GLB yet) — the useShotGenerations precedent.
export function useLivePartGenerations(generationIds: string[]): Record<string, Generation> {
  const results = useQueries({
    queries: generationIds.map((id) => ({
      queryKey: ['generation', id],
      queryFn: () => api<Generation>(`/api/generations/${id}`),
    })),
  })
  const byId: Record<string, Generation> = {}
  results.forEach((result, index) => {
    const id = generationIds[index]
    if (id && result.data) byId[id] = result.data
  })
  return byId
}
