// apps/api/src/modules/prompt/enhance.ts
// Prompt enhancer — rewrites a user's rough, messy shot idea into ONE vivid,
// concrete ENGLISH cinematic prompt for the Wan text-to-video model, using an
// ORDERED CHAIN of OpenAI-compatible LLM providers.
//
// It serves TWO consumers and is FREE (charges NO credits): it is an LLM assist
// that improves a PAID generation, so it must not itself charge. The 'soften'
// mode additionally rewrites AWAY content a provider safety filter would block —
// that is what the Cinema "Смягчить и повторить" button calls after a
// content_blocked generation.
//
// ── WHY A CHAIN, NOT ONE PROVIDER ────────────────────────────────────────────
// DeepInfra (DeepSeek-V3) is the primary — paid, and better when funded. But a
// paid account runs dry (today it returns "You need positive balance to do
// inference"), and when it does, a single-provider enhancer is simply down. So the
// service tries providers IN ORDER and uses the first that is (a) configured and
// (b) succeeds, falling through to the next on ANY failure — no-balance, 4xx/5xx,
// network, OR a malformed answer. Groq (llama-3.3-70b) is the FREE fallback: same
// system prompt, same modes, same [[eN]] rule — only the provider differs, so the
// output is behaviorally identical. Only when ALL configured providers fail do we
// surface provider_error; if none is configured, provider_error as before.
//
// Same optional-secret discipline as films/storyboard.ts: an unset token drops its
// provider from the chain (boot stays healthy), the completion is parsed+validated
// OURSELVES (fence-strip + zod) so a malformed answer falls through / ends as a
// clean 502, and NO raw provider text ever reaches the client.
import { promptEnhanceResultSchema } from '@opencreate/contracts'
import type { PromptEnhanceInput, PromptEnhanceResult } from '@opencreate/contracts'
import type { FastifyBaseLogger } from 'fastify'

// 502 provider_error — the SAME envelope the generation and storyboard paths use
// when a provider is unavailable, so the SPA shows one "try again later" message
// everywhere. Shaped (statusCode + apiCode) for app.ts's central error handler.
export class PromptEnhanceUnavailableError extends Error {
  statusCode = 502
  apiCode = 'provider_error'
  constructor(message = 'Prompt enhancement is not configured') {
    super(message)
  }
}

// One provider's chat call: (system, user) → raw model text. `id` names it for the
// per-provider failure log. The service tries these in order; the first success
// wins. `complete` THROWS on any provider failure so the chain falls through.
export type Completer = {
  id: string
  complete: (system: string, user: string) => Promise<string>
}

// Only `warn` is used: a provider failing over to the next is a WARN — diagnosable,
// not user-facing — exactly like the money-path failover logs. A minimal structural
// shape so production passes `app.log` and a test passes `{ warn: vi.fn() }`.
type EnhanceLog = Pick<FastifyBaseLogger, 'warn'>

// ── provider endpoints (both OpenAI-compatible chat-completions) ─────────────
// DeepInfra is the /openai/… surface, NOT the /inference API the Seedance adapter
// uses, so the standard OpenAI body + `Bearer` auth apply — identical to Groq's,
// which is why one request helper serves both.
const DEEPINFRA_CHAT_URL = 'https://api.deepinfra.com/v1/openai/chat/completions'
// DeepSeek-V3 (the -0324 checkpoint), NOT R1: fast, cheap, strong at instruction
// following — exactly what a deterministic JSON rewrite wants. R1's visible
// reasoning would be latency and tokens we would only have to strip back off.
const DEEPINFRA_MODEL = 'deepseek-ai/DeepSeek-V3-0324'
const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions'
// llama-3.3-70b-versatile: Groq's strong, free instruction-following model.
const GROQ_MODEL = 'llama-3.3-70b-versatile'
// A rewrite is not a control-plane call; give it room but bound a hung socket.
const REQUEST_TIMEOUT_MS = 30 * 1000

// ── The system prompt (the heart) ────────────────────────────────────────────
// Shared base for both modes. Order of the described attributes is deliberate —
// it is the order a cinematographer blocks a shot. The [[eN]] rule is in the BASE
// so it protects cast tokens in BOTH modes: a shot prompt can carry opaque cast
// references and mangling one silently breaks casting downstream.
const BASE_SYSTEM = `You are a cinematography prompt engineer for Wan, a text-to-video model. Rewrite the user's rough, messy idea (any language, typos, slang) into ONE vivid, concrete ENGLISH visual prompt for a single continuous camera take. Preserve their core subject and action; do not invent a different scene. Describe, in order: subject + specific physical action (strong present-tense verbs), setting + time of day, lighting + atmosphere, texture/material detail, camera framing + movement, film quality (lens, depth of field, grain). Output the visual description ONLY — no title, no narration, no dialogue, no style labels like 'anime' or 'cinematic' (the system appends those). One paragraph, 40-90 words. Never mention 'Wan', 'AI', or 'prompt'.

CHARACTER REFERENCES: Any token of the form [[eN]] (for example [[e1]], [[e2]]) is a character reference — copy it VERBATIM, unchanged, in place; never rename, translate, or remove it.`

// Appended for 'soften' only. It neutralizes the categories a video model's safety
// filter blocks while preserving the emotional beat and the action — the point is
// to get the SAME scene past the filter, not to write a different one.
const SOFTEN_SYSTEM = `

SAFETY REWRITE: The user's idea may contain content a video model's safety filter will block. Rewrite it AWAY while preserving the core scene and action. Specifically: graphic violence or gore — imply it, never depict it (no blood, no wounds, no weapon striking flesh); explicit or sexual content — make it suggestive at most, clothed and non-explicit; real, named public figures — replace the name with an unnamed lookalike or archetype (for example "a stern world leader", never the actual name); politics, hate, and real-world tragedy — abstract them into a neutral dramatic staging. Keep the emotion and the action; change only what would trip a filter.`

// Closing instruction, both modes: strict JSON only. We parse + validate it
// ourselves rather than trusting a response_format flag across providers.
const OUTPUT_SYSTEM = `

Return STRICT JSON only, no markdown fences: {"prompt": "<the visual description>"}`

// Build the full system prompt for a mode. 'soften' inserts the safety block
// BEFORE the output instruction so the JSON directive is always last.
export function buildSystemPrompt(mode: PromptEnhanceInput['mode']): string {
  return mode === 'soften'
    ? BASE_SYSTEM + SOFTEN_SYSTEM + OUTPUT_SYSTEM
    : BASE_SYSTEM + OUTPUT_SYSTEM
}

// ── the providers ────────────────────────────────────────────────────────────
// Both wrap the same OpenAI-compatible call; only URL + model differ. `fetchImpl`
// defaults to global fetch and is injected by tests to assert the request shape
// and drive fallthrough without a network.
export function createDeepinfraCompleter(token: string, fetchImpl: typeof fetch = fetch): Completer {
  return {
    id: 'deepinfra',
    complete: (system, user) =>
      callOpenAiChat(fetchImpl, DEEPINFRA_CHAT_URL, token, DEEPINFRA_MODEL, system, user),
  }
}

export function createGroqCompleter(apiKey: string, fetchImpl: typeof fetch = fetch): Completer {
  return {
    id: 'groq',
    complete: (system, user) =>
      callOpenAiChat(fetchImpl, GROQ_CHAT_URL, apiKey, GROQ_MODEL, system, user),
  }
}

// Ordered chain of the CONFIGURED providers: DeepInfra primary (paid/better when
// funded), Groq the free fallback. An unset token drops its provider, so an empty
// chain means nothing is configured (→ provider_error). Order is the failover order.
export function buildEnhanceChain(
  deepinfraToken: string | null,
  groqApiKey: string | null,
  fetchImpl: typeof fetch = fetch,
): Completer[] {
  const chain: Completer[] = []
  if (deepinfraToken) chain.push(createDeepinfraCompleter(deepinfraToken, fetchImpl))
  if (groqApiKey) chain.push(createGroqCompleter(groqApiKey, fetchImpl))
  return chain
}

type Deps = {
  deepinfraToken: string | null
  groqApiKey: string | null
  // Test override: a ready ORDERED chain that REPLACES the token-derived one, so a
  // test drives fallthrough with fakes (or real adapters over a mocked fetch) and
  // never hits the network. Mirrors the old injected `complete`, now a list.
  completers?: Completer[]
  // Base logger for per-provider failover diagnosis; omitted in tests that don't assert logs.
  log?: EnhanceLog | null
}

export type PromptEnhanceService = ReturnType<typeof createPromptEnhanceService>

export function createPromptEnhanceService({ deepinfraToken, groqApiKey, completers, log }: Deps) {
  // Resolve the chain ONCE at construction: an explicit override wins (tests),
  // otherwise derive it from the configured tokens (production).
  const chain = completers ?? buildEnhanceChain(deepinfraToken, groqApiKey)

  async function enhance(input: PromptEnhanceInput): Promise<PromptEnhanceResult> {
    // Nothing configured → clean provider_error, never a crash (the route already
    // gates, but a direct caller gets the same honest failure).
    if (chain.length === 0) throw new PromptEnhanceUnavailableError()

    const system = buildSystemPrompt(input.mode)
    // Try each configured provider IN ORDER. A provider failure — no-balance,
    // 4xx/5xx, network, OR a malformed answer (parseEnhanceResult throws) — falls
    // through to the next; the first success wins. The user's rough idea (with any
    // [[eN]] cast tokens) is handed to every provider UNCHANGED.
    for (const provider of chain) {
      try {
        const raw = await provider.complete(system, input.text)
        return parseEnhanceResult(raw)
      } catch (err) {
        // Log the per-provider failure for diagnosis (like the money-path failover
        // logs), but the reason NEVER reaches the client — the final throw below is
        // the fixed provider_error copy. `err.message` here is a neutral category
        // (HTTP status / network / invalid answer), never a raw provider body, so
        // even the log line cannot leak a provider's account or balance text.
        log?.warn(
          {
            event: 'prompt.provider_failed',
            provider: provider.id,
            reason: err instanceof Error ? err.message : 'unknown',
          },
          'prompt provider failed, trying next',
        )
      }
    }
    // Every configured provider failed. Distinct message from the empty-chain case
    // above (both are provider_error 502, but this one is transient, not misconfig).
    throw new PromptEnhanceUnavailableError('Prompt enhancement is temporarily unavailable')
  }

  return { enhance }
}

// Parse + validate the model completion. Strips an accidental ```json fence, then
// validates against the shared result schema so a malformed answer (or an empty
// prompt) is a clean failure — which, inside the chain, becomes a fallthrough to
// the next provider and only a 502 when it is the last. Mirrors storyboard.ts's
// parseStoryboard exactly.
export function parseEnhanceResult(raw: string): PromptEnhanceResult {
  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new PromptEnhanceUnavailableError('The prompt model returned an unreadable response')
  }
  const result = promptEnhanceResultSchema.safeParse(json)
  if (!result.success)
    throw new PromptEnhanceUnavailableError('The prompt model returned an invalid response')
  return result.data
}

// One OpenAI-compatible chat-completions call → raw model text. Shared by both
// providers (identical request shape; only URL + model differ). THROWS a SANITIZED
// Error on ANY failure so the chain falls through to the next provider. The
// provider's own body — which can name a balance or an account (DeepInfra's
// no-balance message, for one) — is NEVER read into the error: only the HTTP status
// or a neutral category, so it cannot leak in the log OR the (fixed) client envelope.
async function callOpenAiChat(
  fetchImpl: typeof fetch,
  url: string,
  token: string,
  model: string,
  system: string,
  user: string,
): Promise<string> {
  let res: Response
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        // Low but non-zero: the rewrite must be faithful and reproducible, not
        // creative embroidery on top of the user's scene.
        temperature: 0.4,
        // One paragraph of 40-90 words plus the JSON wrapper fits well under this.
        max_tokens: 700,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch {
    throw new Error('network error')
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = (await res.json().catch(() => null)) as
    | { choices?: { message?: { content?: string } }[] }
    | null
  const content = body?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || content.trim() === '') throw new Error('empty response')
  return content
}
