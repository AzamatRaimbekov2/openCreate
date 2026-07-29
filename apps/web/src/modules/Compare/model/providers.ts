// apps/web/src/modules/Compare/model/providers.ts
// The provider registry + the one function that runs a contender. Each entry
// resolves to the SAME PanelResult shape so the store and panels stay
// channel-blind — adding a fourth model is one array entry + one branch here.
import type { CompareGenerateResult, Generation } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'
import type { CompareProviderId, PanelResult } from './types'

export type CompareProvider = {
  id: CompareProviderId
  // Panel header — the model's public name, not our catalog alias.
  label: string
  // Which pipe the render travels (shown as the panel's sublabel): the two
  // catalog models exercise the REAL production path incl. credits; Qwen is
  // the direct DeepInfra candidate.
  channel: 'Runware · credits' | 'DeepInfra · USD'
}

// Order = on-screen order (left → right on desktop).
export const COMPARE_PROVIDERS: CompareProvider[] = [
  { id: 'flux-dev', label: 'FLUX dev', channel: 'Runware · credits' },
  { id: 'nano-banana-pro', label: 'Nano Banana Pro', channel: 'Runware · credits' },
  { id: 'qwen-image-max', label: 'Qwen Image Max', channel: 'DeepInfra · USD' },
]

// Catalog contenders ride POST /api/generations — deliberately the FULL
// production path (charge, provider roundtrip, /media download) because the
// page compares what a user actually experiences, not a lab shortcut.
// Duration is client-measured for the same reason.
async function runCatalogModel(
  modelId: CompareProviderId,
  prompt: string,
  signal: AbortSignal,
): Promise<PanelResult> {
  const startedAt = Date.now()
  const generation = await api<Generation>('/api/generations', {
    method: 'POST',
    body: JSON.stringify({ modelId, prompt, aspectRatio: '1:1' }),
    signal,
  })
  const imageUrl = generation.mediaUrls[0]
  if (generation.status !== 'succeeded' || imageUrl === undefined) {
    // Images settle synchronously (201) — a non-succeeded answer here is a
    // provider failure the API already refunded and sanitized.
    return { status: 'error', error: generation.errorMessage ?? 'Generation failed' }
  }
  return {
    status: 'success',
    imageUrl,
    durationMs: Date.now() - startedAt,
    costLabel: `${generation.costCredits} cr`,
  }
}

// The candidate rides the direct channel; duration comes server-measured
// (provider call only) and cost is DeepInfra's own USD figure.
async function runQwen(prompt: string, signal: AbortSignal): Promise<PanelResult> {
  const result = await api<CompareGenerateResult>('/api/compare/generate', {
    method: 'POST',
    body: JSON.stringify({ prompt }),
    signal,
  })
  return {
    status: 'success',
    imageUrl: result.imageUrl,
    durationMs: result.durationMs,
    // exactOptionalPropertyTypes: only attach the chip when a figure exists.
    ...(result.costUsd !== null ? { costLabel: `$${result.costUsd.toFixed(3)}` } : {}),
  }
}

// NEVER throws — every failure folds into the error PanelResult so one
// contender's crash can't reject the store's Promise.all and freeze the page.
export async function runCompareProvider(
  id: CompareProviderId,
  prompt: string,
  signal: AbortSignal,
): Promise<PanelResult> {
  try {
    return id === 'qwen-image-max'
      ? await runQwen(prompt, signal)
      : await runCatalogModel(id, prompt, signal)
  } catch (err) {
    // Abort = the user navigated away or restarted the run — the store drops
    // aborted writes anyway, but the fold keeps this function's never-throw
    // contract airtight.
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { status: 'error', error: 'Cancelled' }
    }
    // ApiClientError.message is already user-safe (the API sanitizes envelopes).
    return { status: 'error', error: err instanceof Error ? err.message : 'Request failed' }
  }
}
