// wan-runpod ComfyUI adapter (ADR: wan-selfhost-video-provider, ComfyUI-HTTP
// spike variant). Implements the neutral VideoProvider against our self-hosted
// pod's ComfyUI HTTP API: submit templates the Wan 2.2 t2v workflow and POSTs it
// to /prompt; poll reads /history/<prompt_id> and resolves the SaveVideo output
// into a /view download URL the storage layer copies into our bucket.
//
// Failure model mirrors the Runware client: a TRANSPORT failure (unset config,
// non-2xx, network) THROWS a sanitized ComfyError (→ provider_error envelope /
// row stays processing and retries on poll); a genuine ComfyUI EXECUTION error
// in history maps to the neutral error STATE (→ the service fails + refunds).
import { randomInt, randomUUID } from 'node:crypto'
import type { VideoPollResult, VideoProvider, VideoSubmitInput } from '../video-provider'
import {
  WAN22_T2V_WORKFLOW,
  framesForDuration,
  type ComfyWorkflow,
} from './wan22-t2v-workflow'

// Sanitized provider error, shaped like RunwareError so the app.ts central
// handler maps it straight to { error: { code: 'provider_error', … } } (502).
// Never carries a raw ComfyUI response body — only stable, operator-safe text.
export class ComfyError extends Error {
  statusCode = 502
  apiCode = 'provider_error'
  constructor(message: string) {
    super(message)
    this.name = 'ComfyError'
  }
}

// Control-plane calls (/prompt, /history) are small JSON round-trips — the
// RENDER itself is not awaited here (poll-driven), so a tight timeout is right:
// a hung pod socket must never pin a request handler. 30s is generous for JSON.
const REQUEST_TIMEOUT_MS = 30_000
// noise_seed is a ComfyUI signed 64-bit-ish field; keep well within JS safe int.
const MAX_SEED = 2_147_483_647

// Node titles we template. Injecting by _meta.title (not node id) tolerates
// upstream node-id churn as long as the worker keeps the titles stable.
const TITLE = {
  positive: 'PROMPT_POSITIVE',
  negative: 'PROMPT_NEGATIVE',
  dims: 'LATENT_DIMS',
  output: 'OUTPUT_VIDEO',
} as const

type ComfyOptions = {
  // The pod's ComfyUI base URL (config.comfyBaseUrl). null/undefined = the
  // provider is not configured; submit returns a clean provider_error instead
  // of crashing boot, so the wan-2-2 catalog entry can still be listed.
  baseUrl?: string | null
  // Injectable for tests; defaults to the embedded Wan 2.2 t2v graph.
  workflow?: ComfyWorkflow
}

// Find a node by its _meta.title. Returns undefined if the title is absent so
// the caller can fail loudly rather than silently skip an injection.
function nodeByTitle(graph: ComfyWorkflow, title: string) {
  return Object.values(graph).find((n) => n._meta?.title === title)
}

// Resolve the finished video file from a ComfyUI history `outputs` map. Native
// SaveVideo, VHS_VideoCombine and image save nodes all emit file descriptors
// ({ filename, subfolder, type }) under DIFFERENT keys (images/videos/gifs), so
// this scans key-agnostically for the first array element that has a filename.
function resolveOutputFile(
  outputs: Record<string, Record<string, unknown>> | undefined,
): { filename: string; subfolder: string; type: string } | null {
  if (!outputs) return null
  for (const nodeOut of Object.values(outputs)) {
    for (const value of Object.values(nodeOut)) {
      if (!Array.isArray(value)) continue
      for (const item of value) {
        if (item && typeof item === 'object' && typeof (item as { filename?: unknown }).filename === 'string') {
          const f = item as { filename: string; subfolder?: string; type?: string }
          return { filename: f.filename, subfolder: f.subfolder ?? '', type: f.type ?? 'output' }
        }
      }
    }
  }
  return null
}

// Pull a human-ish message out of a ComfyUI error status. history status carries
// messages like ['execution_error', { exception_message, ... }].
function extractHistoryError(status: { messages?: unknown } | undefined): string {
  const messages = Array.isArray(status?.messages) ? status.messages : []
  for (const m of messages) {
    if (Array.isArray(m) && m[0] === 'execution_error' && m[1] && typeof m[1] === 'object') {
      const exc = (m[1] as { exception_message?: unknown }).exception_message
      if (typeof exc === 'string' && exc) return exc
    }
  }
  return 'ComfyUI reported an execution error'
}

export function createComfyClient(opts: ComfyOptions = {}): VideoProvider {
  const template = opts.workflow ?? WAN22_T2V_WORKFLOW

  const submit = async (input: VideoSubmitInput): Promise<{ providerJobId: string }> => {
    const base = opts.baseUrl
    if (!base) throw new ComfyError('wan-runpod provider is not configured (COMFY_BASE_URL unset)')

    // Deep clone so concurrent submits never race on shared node objects and the
    // embedded template is never mutated.
    const graph: ComfyWorkflow = structuredClone(template)
    const seed = input.seed ?? randomInt(0, MAX_SEED)

    const positive = nodeByTitle(graph, TITLE.positive)
    if (positive) positive.inputs.text = input.prompt
    const negative = nodeByTitle(graph, TITLE.negative)
    // The service has no negative-prompt field today; clear the template's
    // placeholder so the literal string never steers the model.
    if (negative) negative.inputs.text = ''
    const dims = nodeByTitle(graph, TITLE.dims)
    if (dims) {
      dims.inputs.width = input.width
      dims.inputs.height = input.height
      dims.inputs.length = framesForDuration(input.durationSeconds)
    }
    // Both experts (high/low noise samplers) share the seed — they refine one
    // generation, so a single seed keeps the two stages coherent.
    for (const node of Object.values(graph)) {
      if (node.inputs && 'noise_seed' in node.inputs) node.inputs.noise_seed = seed
    }
    const output = nodeByTitle(graph, TITLE.output)
    // Unique prefix per job so concurrent renders never collide in the pod's
    // output dir (poll still reads the real filename back from history).
    if (output) output.inputs.filename_prefix = `oc_${Date.now()}_${randomUUID().slice(0, 8)}`

    const clientId = randomUUID()
    const raw = await postJson(`${base}/prompt`, { prompt: graph, client_id: clientId })
    // ComfyUI returns node_errors on a graph it refuses to queue — treat as a
    // submit failure so the service fails + refunds (never a stuck row).
    const nodeErrors = (raw as { node_errors?: Record<string, unknown> }).node_errors
    if (nodeErrors && Object.keys(nodeErrors).length > 0)
      throw new ComfyError('ComfyUI rejected the workflow (node_errors)')
    const promptId = (raw as { prompt_id?: unknown }).prompt_id
    if (typeof promptId !== 'string' || !promptId)
      throw new ComfyError('ComfyUI /prompt returned no prompt_id')
    return { providerJobId: promptId }
  }

  const poll = async (providerJobId: string): Promise<VideoPollResult> => {
    const base = opts.baseUrl
    // Defensive: submit would have failed if unset, so no processing row should
    // reach here — but map to a terminal error rather than throw, matching the
    // getResponse "provider error → state" contract.
    if (!base) return { status: 'error', message: 'wan-runpod provider is not configured' }

    const raw = await getJson(`${base}/history/${encodeURIComponent(providerJobId)}`)
    const entry = (raw as Record<string, unknown>)[providerJobId] as
      | { status?: { status_str?: string; completed?: boolean; messages?: unknown }; outputs?: Record<string, Record<string, unknown>> }
      | undefined
    // Not in history yet → still queued or running (ComfyUI returns {} for an
    // unknown/pending prompt_id). Coarse state: no incremental progress bar.
    if (!entry) return { status: 'processing', progress: null }
    if (entry.status?.status_str === 'error')
      return { status: 'error', message: extractHistoryError(entry.status) }

    const file = resolveOutputFile(entry.outputs)
    if (file) {
      const params = new URLSearchParams({ filename: file.filename, subfolder: file.subfolder, type: file.type })
      return {
        status: 'success',
        assetUrl: `${base}/view?${params.toString()}`,
        // No provider-side moderation on self-host — see the ADR's moderation-
        // parity gap. The wan-2-2 catalog entry is gated with that understood.
        nsfw: false,
      }
    }
    // Terminal-success but no file we can resolve → surface success with no
    // asset so the service's no-asset guard fails + refunds (never loops).
    if (entry.status?.status_str === 'success' || entry.status?.completed === true)
      return { status: 'success', nsfw: false }
    // Entry exists but nothing produced yet → still running.
    return { status: 'processing', progress: null }
  }

  return { submit, poll }
}

// RunPod's HTTP proxy (proxy.runpod.net) sits behind Cloudflare, which returns
// 403 (CF error 1010) to non-browser User-Agents — a bare Node fetch is blocked
// on POST /prompt. Every request to the pod MUST carry a browser UA. Verified
// live: with this UA, POST /prompt returns 200; without it, 403.
export const COMFY_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

// Shared fetch helpers: one hard timeout spans the request, non-2xx throws a
// SANITIZED ComfyError (status only — never the response body, which is
// unvetted pod output). These transport failures are transient by contract:
// the service leaves the row processing and the next poll retries.
async function postJson(url: string, body: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': COMFY_USER_AGENT },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }).catch((err) => {
    throw new ComfyError(`ComfyUI request failed: ${err instanceof Error ? err.name : 'network error'}`)
  })
  if (!res.ok) throw new ComfyError(`ComfyUI HTTP ${res.status}`)
  return res.json().catch(() => {
    throw new ComfyError('ComfyUI returned a non-JSON response')
  })
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { 'User-Agent': COMFY_USER_AGENT },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }).catch((err) => {
    throw new ComfyError(`ComfyUI request failed: ${err instanceof Error ? err.name : 'network error'}`)
  })
  if (!res.ok) throw new ComfyError(`ComfyUI HTTP ${res.status}`)
  return res.json().catch(() => {
    throw new ComfyError('ComfyUI returned a non-JSON response')
  })
}
