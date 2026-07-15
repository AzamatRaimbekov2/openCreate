// apps/api/src/modules/entities/portraits.ts
// Soul Studio's reference sheet: turn a stored `soul` into N portraits of the
// SAME character.
//
// ADR: docs/wiki/decisions/ai-soul-studio.md (§3 the model rule, §4 the money path)
//
// This file is an ORCHESTRATOR and nothing else. It owns no table, spends no
// credits, and holds no state. It depends on both the entity service and the
// generation service; neither depends on it, which is what keeps the dependency
// graph acyclic — the generation service already depends on entities (it resolves
// `[[e1]]` mentions), so the sheet logic could not live inside either of them
// without closing a cycle.
//
// TWO RULES DO ALL THE WORK HERE.
//
// 1. THE MODEL RULE. `flux-kontext-pro` is the only catalogue entry that accepts
//    a reference image. So the FIRST portrait — with no photo to condition on —
//    renders on the cheap `flux-dev`, and every LATER one renders on kontext with
//    the character referencing ITSELF (`entityRefs: [{ e1, entityId }]`, pointing
//    at the primary photo the first portrait just became). That self-reference is
//    what keeps the face the same across the sheet. Without it a four-view sheet
//    is four strangers — for 26 credits, with no error anywhere.
//
//    This is why the loop below is SEQUENTIAL and reloads the entity every time:
//    the hero shot must land AND become primary before the next view is submitted.
//    Rendering the four views concurrently would be faster and would produce four
//    different people.
//
// 2. THE MONEY RULE. Every portrait goes through generationService.create(), which
//    is the single choke point that charges at submit, refunds on failure inside
//    one transaction, and gates NSFW. Soul Studio adds ZERO ledger code — if you
//    ever find yourself importing the ledger here, the design has gone wrong.
import {
  PORTRAIT_VIEWS,
  SOUL_HERO_MODEL_ID,
  SOUL_SHEET_MODEL_ID,
  apiErrorCodeSchema,
  composePortraitPrompt,
  soulPromptPreset,
} from '@opencreate/contracts'
import type {
  ApiErrorCode,
  CreatePortraitsInput,
  Entity,
  PortraitResult,
  PortraitView,
  PortraitsResponse,
} from '@opencreate/contracts'
import type { MoneyLog } from '../credits/ledger'
import type { GenerationService } from '../generations/service'
import type { EntityService } from './service'

// Thrown when the entity has no soul. Minting portraits for one is meaningless:
// the prompt IS the composed soul, so without it there is nothing to draw — and
// the only alternative (fall back to the free-prose description) would quietly
// charge the user 26 credits for a sheet of whatever their old prose implied.
export class SoulRequiredError extends Error {
  constructor(id: string) {
    super(`entity has no soul to render: ${id}`)
    this.name = 'SoulRequiredError'
  }
}

// The generation service, narrowed to the ONE method this orchestrator may call.
// Stating that in the type is the cheapest possible guard against this file
// growing a second money path (a poll here, a refund there) — and it lets the
// tests hand over a recording fake without stubbing a service they never use.
type PortraitGenerations = Pick<GenerationService, 'create'>

// A failed view is reported to the browser as a CODE, never as the thrown
// message. The message may have come from a provider, and provider text is
// operator material — app.ts sanitizes exactly this for ordinary error
// envelopes (it can carry hostnames, task ids, our own account id), and a
// per-view result must not become the hole in that. Every domain error in this
// codebase already carries a stable `apiCode`; anything that does not is, by
// definition, the unexpected kind — so it degrades to a generic code and the
// real error goes to the log, where an operator can actually act on it.
function toErrorCode(error: unknown, view: PortraitView, reqLog?: MoneyLog): ApiErrorCode {
  const apiCode = (error as { apiCode?: unknown }).apiCode
  const parsed = apiErrorCodeSchema.safeParse(apiCode)
  if (parsed.success) return parsed.data
  reqLog?.error({ event: 'portrait.error', view, err: error }, 'portrait failed')
  return 'internal_error'
}

export type PortraitService = ReturnType<typeof createPortraitService>

export function createPortraitService({
  entities,
  generations,
}: {
  entities: EntityService
  generations: PortraitGenerations
}) {
  return {
    async create(
      userId: string,
      entityId: string,
      input: CreatePortraitsInput,
      // The request-scoped logger, so every money-path line this call causes
      // (charge / refund / settle) carries the reqId — same convention as the
      // generation routes.
      reqLog?: MoneyLog,
    ): Promise<PortraitsResponse> {
      // Ownership and existence, once, BEFORE anything is charged. A foreign id
      // fails here as a 404 and costs nothing.
      let entity: Entity = await entities.get(userId, entityId)
      const soul = entity.soul ?? null
      if (!soul) throw new SoulRequiredError(entityId)

      const portraits: PortraitResult[] = []

      for (const view of input.views) {
        try {
          // RELOAD every iteration. The primary photo changes as views land, and
          // the primary photo is the entire input to the model rule below — a
          // stale read here would submit view 2 on the cheap model and hand the
          // user a stranger.
          entity = await entities.get(userId, entityId)
          const hasPrimary = entity.primaryImageId !== null

          const { dto } = await generations.create(
            userId,
            {
              // THE MODEL RULE (ADR §3), and the only place it exists.
              modelId: hasPrimary ? SOUL_SHEET_MODEL_ID : SOUL_HERO_MODEL_ID,
              // The prompt is composed from the STRUCTURE, server-side. The client
              // asked for a view; it never sends prompt text.
              prompt: composePortraitPrompt(soul, view),
              // A full-body shot in a square frame wastes half its pixels on
              // background, so the aspect travels with the view.
              aspectRatio: PORTRAIT_VIEWS[view].aspect,
              // The character's style (which carries its own negative prompt) plus
              // the reference-sheet framing (which carries the "clean and
              // unambiguous" negative). Handing over the PRESET rather than the
              // composed fragments is what keeps both negatives alive.
              promptPreset: soulPromptPreset(soul),
              // The character referencing ITSELF. Note there is deliberately NO
              // `[[e1]]` token in the prompt above: the ref exists to deliver the
              // reference IMAGE, and the soul text already describes the character
              // — substituting the placeholder would paste the whole description
              // inside itself. composePrompt tolerates a declared ref with no
              // token in the text; it only throws on the reverse (a token with no
              // ref), which is the direction that actually poisons a render.
              ...(hasPrimary ? { entityRefs: [{ placeholder: 'e1', entityId }] } : {}),
            },
            reqLog,
          )

          // Image generations are SYNCHRONOUS (the service resolves the asset
          // before returning), so attach in the same call. Leaving the attach to
          // the client would open a window — a closed tab, a dropped connection —
          // in which the user has paid for a portrait that belongs to nothing.
          entity = await entities.addImage(userId, entityId, {
            source: 'generated',
            generationId: dto.id,
            view,
          })
          portraits.push({ view, generationId: dto.id, errorCode: null })
        } catch (error) {
          // Record and CONTINUE. A sheet is N separately-paid jobs and the
          // generation service has already refunded this one; collapsing the whole
          // call into a single error would hide which views the user actually got
          // and was charged for. The next view still has the primary photo (if the
          // hero landed), so it is still worth attempting.
          portraits.push({
            view,
            generationId: null,
            errorCode: toErrorCode(error, view, reqLog),
          })
        }
      }

      // The entity as it now stands — with whatever portraits survived already
      // attached, in sheet order.
      return { entity, portraits }
    },
  }
}
