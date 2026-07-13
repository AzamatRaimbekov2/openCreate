// The failover chain: ONE catalog model, several interchangeable backends behind
// it, tried in order until one accepts. The user picks "Auteur" and gets a video;
// which company rendered it is our business, and it can change between two clicks
// without them ever noticing.
//
// WHY. Today taught us what a single-provider dependency costs: the Runware balance
// ran dry and PixVerse, Seedance 1.5, Kling, Veo, voiceover AND music died at once
// — not degraded, died. A chain turns "our provider is down" from an outage into a
// slower request.
//
// It is a VideoProvider itself, so nothing else changes: the registry, the service,
// the money path and the SPA all see one provider. Composition, not a special case.
//
// ── THE TWO RULES, AND THEY ARE MONEY RULES ─────────────────────────────────────
//
// 1. FAIL OVER AT SUBMIT ONLY.
//    Once a backend ACCEPTS a job it is rendering, and we are already being billed.
//    If its poll then fails, re-submitting to the next link would have us pay TWO
//    providers for one generation the user paid for once — a silent margin leak
//    that grows with every outage. A post-acceptance failure is a failed generation
//    → the service refunds. Full stop.
//
// 2. NEVER FAIL OVER A CONTENT REFUSAL.
//    Moderation is deterministic: the same model, refusing the same frame, at a
//    different reseller, refuses again. Walking the chain on `content_blocked`
//    would spend the whole chain's money to hear one no — and make the user wait N×
//    as long to be told it.
//
// ── HOW poll() FINDS ITS WAY BACK ───────────────────────────────────────────────
// The service persists ONE job id and polls with it later, possibly after a
// restart. So the winning link is ENCODED INTO the id we hand back
// (`deepinfra#abc-123`) and decoded on the way in. No schema change, no new column,
// and the truth about which backend actually ran a generation stays queryable in
// the row rather than living in someone's memory.
import type { VideoPollResult, VideoProvider, VideoProviderId, VideoSubmitInput } from './video-provider'

// A link in the chain: the provider, plus the id it is known by (which is what gets
// encoded into the job id and logged when it fails).
export type FailoverLink = {
  id: VideoProviderId
  provider: VideoProvider
}

export type FailoverOptions = {
  // Called when a link refuses a job and the next one is tried. A chain that
  // silently absorbs a dead provider is a chain that HIDES a dead provider: the
  // outage becomes invisible, the fallback becomes the permanent path, and nobody
  // finds out until the fallback dies too. Wired to the logger in app.ts.
  onFailover?: (event: { from: VideoProviderId; to: VideoProviderId; reason: string }) => void
}

// Not a character any provider uses in its own ids, and even if one did, only the
// FIRST occurrence is ours (see decodeJobId).
const SEPARATOR = '#'

export function encodeJobId(linkId: VideoProviderId, innerId: string): string {
  return `${linkId}${SEPARATOR}${innerId}`
}

// Split on the FIRST separator only. A provider is free to hand back an id that
// itself contains a '#'; splitting on every one would corrupt it and lose the job.
// A bare id (no separator) is a row written BEFORE the chain existed — it polls the
// first link, which is where it came from.
export function decodeJobId(jobId: string): { linkId: string | null; innerId: string } {
  const at = jobId.indexOf(SEPARATOR)
  if (at === -1) return { linkId: null, innerId: jobId }
  return { linkId: jobId.slice(0, at), innerId: jobId.slice(at + 1) }
}

// A refusal on CONTENT grounds, not infrastructure. Every adapter here marks it the
// same way (ArkError/DashscopeError/DeepinfraError all set apiCode), because the
// service already keys the refund-with-an-explanation path off it.
function isContentRefusal(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { apiCode?: string }).apiCode === 'content_blocked'
  )
}

export function createFailoverProvider(
  links: FailoverLink[],
  opts: FailoverOptions = {},
): VideoProvider {
  if (links.length === 0) throw new Error('failover provider needs at least one link')

  const submit = async (input: VideoSubmitInput): Promise<{ providerJobId: string }> => {
    let lastError: unknown

    for (let i = 0; i < links.length; i += 1) {
      const link = links[i]!
      try {
        const { providerJobId } = await link.provider.submit(input)
        return { providerJobId: encodeJobId(link.id, providerJobId) }
      } catch (err) {
        // RULE 2. The model looked at this input and said no. The next reseller runs
        // the SAME model and will say the same no — walking on would pay the whole
        // chain to hear it again, and make the user wait for every hop.
        if (isContentRefusal(err)) throw err

        lastError = err
        const next = links[i + 1]
        if (next) {
          opts.onFailover?.({
            from: link.id,
            to: next.id,
            reason: err instanceof Error ? err.message : 'unknown provider failure',
          })
        }
      }
    }

    // Every link is down. Rethrow the LAST failure rather than inventing a new one:
    // it carries the apiCode the service settles and refunds on, exactly as it would
    // with a single provider. A chain that fails should fail like one provider, not
    // like a new category of thing nobody wrote a branch for.
    throw lastError
  }

  const poll = async (providerJobId: string): Promise<VideoPollResult> => {
    const { linkId, innerId } = decodeJobId(providerJobId)

    // No prefix: a row from before the chain shipped. It came from the first link,
    // because that is what the registry entry used to be. Polling it keeps every
    // in-flight generation alive across the deploy that introduces this file.
    const link = linkId === null ? links[0]! : links.find((l) => l.id === linkId)

    // The job names a link that no longer exists — the chain was reconfigured, or a
    // provider was removed. SETTLE it: a row nobody can answer would hold the user's
    // credits until the hour-long stale reaper frees them, and we can say so now.
    if (!link)
      return {
        status: 'error',
        message: 'the backend that started this generation is no longer available',
      }

    // RULE 1. Whatever comes back — processing, success, or a dead render — is
    // returned AS IS. A failure here is a failure of a job that is already running
    // and already billing us; re-submitting it elsewhere would buy the same video
    // twice. The service fails the row and refunds, which is the honest outcome.
    return link.provider.poll(innerId)
  }

  return { submit, poll }
}
