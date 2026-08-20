// The image failover chain: ONE catalogue entry, two backends, tried in order
// until one accepts. The user picks "Flash" and gets a picture; whether Seedream
// or FLUX rendered it is our business and may change between two clicks.
//
// The video chain (failover-provider.ts) established the two rules, and they are
// MONEY rules — they are restated rather than referenced because getting either
// wrong costs real money in a way tests are slow to notice:
//
// 1. FAIL OVER AT SUBMIT ONLY. Once a backend accepts a job it is rendering and
//    we are being billed. Re-submitting after a failed POLL would pay two vendors
//    for one image the user paid for once. A post-acceptance failure is a failed
//    generation → the service refunds. Full stop.
//
// 2. NEVER FAIL OVER A CONTENT REFUSAL. Moderation is deterministic: the same
//    model refusing the same prompt at another reseller refuses again. Walking
//    the chain would spend all of it to hear one no, N times slower.
//
// WHAT IS NEW HERE, and why this is not a generic copy of the video chain: an
// image submit can come back ALREADY FINISHED ('done', the synchronous Runware
// shape) instead of pending. A finished result has no job id to route later, so
// there is nothing to encode and it is returned untouched. Only a 'pending' id
// gets the link prefix — because only a pending job will ever be polled.
import type {
  ImageProvider,
  ImageProviderId,
  ImagePollResult,
  ImageSubmitInput,
  ImageSubmitResult,
} from './image-provider'

export type ImageFailoverLink = {
  id: ImageProviderId
  provider: ImageProvider
}

export type ImageFailoverOptions = {
  // Called when a link refuses a job and the next is tried. A chain that silently
  // absorbs a dead provider HIDES a dead provider: the outage becomes invisible,
  // the fallback quietly becomes the permanent path, and nobody finds out until
  // the fallback dies too. Wired to the logger in app.ts.
  onFailover?: (event: { from: ImageProviderId; to: ImageProviderId; reason: string }) => void
}

// Deliberately the same separator the video chain uses. NOT imported from it:
// that module's helpers are typed to VideoProviderId, and widening them so an
// image id typechecks would let a video id be encoded into an image row — the
// exact confusion the two separate provider unions exist to prevent.
const SEPARATOR = '#'

export function encodeImageJobId(linkId: ImageProviderId, innerId: string): string {
  return `${linkId}${SEPARATOR}${innerId}`
}

// Split on the FIRST separator only: a provider may hand back an id that itself
// contains a '#', and splitting on every one would corrupt it and lose the job.
// A bare id (no separator) means a row written before this chain existed — it
// polls the first link, which is where it came from.
export function decodeImageJobId(jobId: string): { linkId: string | null; innerId: string } {
  const at = jobId.indexOf(SEPARATOR)
  if (at === -1) return { linkId: null, innerId: jobId }
  return { linkId: jobId.slice(0, at), innerId: jobId.slice(at + 1) }
}

// A refusal on CONTENT grounds rather than infrastructure. Every adapter marks it
// the same way, because the service already keys its refund-with-an-explanation
// path off exactly this code.
function isContentRefusal(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { apiCode?: string }).apiCode === 'content_blocked'
  )
}

export function createImageFailoverProvider(
  links: ImageFailoverLink[],
  opts: ImageFailoverOptions = {},
): ImageProvider {
  if (links.length === 0) throw new Error('image failover provider needs at least one link')

  const submit = async (input: ImageSubmitInput): Promise<ImageSubmitResult> => {
    let lastError: unknown

    // Only the links that can actually run this model. A backend with no handle
    // for it is not a failure to log and not a call to waste — it simply is not
    // part of this generation's chain.
    const usable = links.filter((l) => input.models[l.id] !== undefined)
    if (usable.length === 0) {
      throw new Error('no image backend is configured for this model')
    }

    for (let i = 0; i < usable.length; i += 1) {
      const link = usable[i]!
      try {
        const result = await link.provider.submit(input)
        // A finished image routes nowhere later — no id, nothing to encode.
        if (result.kind === 'done') return result
        return { kind: 'pending', providerJobId: encodeImageJobId(link.id, result.providerJobId) }
      } catch (err) {
        // RULE 2.
        if (isContentRefusal(err)) throw err

        lastError = err
        const next = usable[i + 1]
        if (next) {
          opts.onFailover?.({
            from: link.id,
            to: next.id,
            reason: err instanceof Error ? err.message : 'unknown provider failure',
          })
        }
      }
    }

    // Every link is down. Rethrow the LAST failure rather than inventing a new
    // one: it carries the apiCode the service settles and refunds on, so a dead
    // chain fails like one dead provider instead of like a new category of thing
    // nobody wrote a branch for.
    throw lastError
  }

  const poll = async (providerJobId: string): Promise<ImagePollResult> => {
    const { linkId, innerId } = decodeImageJobId(providerJobId)

    // No prefix: a row from before this chain shipped. It came from the first
    // link, because that is what the single provider used to be.
    const link = linkId === null ? links[0]! : links.find((l) => l.id === linkId)

    // The job names a link that no longer exists — the chain was reconfigured or a
    // provider removed. SETTLE it rather than answering 'processing' forever: a row
    // nobody can answer would hold the user's credits until the stale reaper frees
    // them an hour later, and we can tell the truth about it right now.
    if (!link) {
      return {
        status: 'error',
        message: 'the backend that started this generation is no longer available',
      }
    }

    // RULE 1. Whatever comes back — processing, success, or a dead render — is
    // returned AS IS. A failure here is a failure of a job already running and
    // already billing us; re-submitting elsewhere would buy the same image twice.
    return link.provider.poll(innerId)
  }

  return { submit, poll }
}
