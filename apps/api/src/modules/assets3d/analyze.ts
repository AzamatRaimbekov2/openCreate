// apps/api/src/modules/assets3d/analyze.ts
// FREE decomposition step (ADR modular-3d-assets D2): Claude vision lists the
// named, separable PARTS of a concept image. Gated on ANTHROPIC_API_KEY exactly
// like CinemaStudio's storyboard — unset → 502 provider_error, and the wizard
// still works because the user can add/edit/remove parts by hand. Nothing is
// charged; each draft part lands with both generation citations null.
//
// This file is an ORCHESTRATOR: it owns no table and spends no credits. It
// depends on a NARROW slice of the asset3d service (ownership + the concept
// image, and an atomic draft-part replace) — never reaching into its internals.
import Anthropic from '@anthropic-ai/sdk'
import { analyzeResponseSchema, MAX_PARTS } from '@opencreate/contracts'
import type { Asset3dPart } from '@opencreate/contracts'

// 502 provider_error — the same envelope the storyboard/generation paths use when
// a provider is unavailable, so the SPA shows one "try again later" message.
export class Asset3dAnalyzeUnavailableError extends Error {
  statusCode = 502
  apiCode = 'provider_error'
  constructor(message = 'Part analysis is not configured') {
    super(message)
  }
}

// The narrow slice of the asset3d service analyze depends on — ownership + the
// concept image, and the atomic draft-part replace. Declaring it as a structural
// type (not the whole service) is the cheapest guard against this orchestrator
// growing a reach-in, and lets tests hand over a recording fake.
type AssetsForAnalyze = {
  // Ownership-checked; returns the concept image as a data URI (throws 404 if not
  // the caller's) BEFORE any model call is made.
  requireAssetConcept: (userId: string, assetId: string) => Promise<string>
  // Replace the asset's DRAFT parts (parts with no citations) with the analyzed
  // set, atomically. Extracted/meshed parts are preserved.
  replaceDraftParts: (
    userId: string,
    assetId: string,
    parts: { name: string; description: string }[],
  ) => Promise<Asset3dPart[]>
}

const SYSTEM_PROMPT = `You segment a single concept image of ONE object/character into its distinct,
separable PARTS for modular 3D reconstruction (e.g. Body, Hair, Helmet, Armor, Boots, Belt).
Return STRICT JSON only — no prose, no markdown fences — matching exactly:
{"parts":[{"name":string,"description":string}]}
Rules:
- "name" is a short noun (1-3 words). "description" is a concrete visual description of that part
  in isolation (material, color, shape) so an image model can redraw it alone.
- Only list parts that are visually separable. Merge trivial detail into the nearest larger part.
- At most ${MAX_PARTS} parts.`

type Deps = {
  anthropicApiKey: string | null
  assets: AssetsForAnalyze
  // Injectable so tests drive analyze without a real Anthropic call.
  complete?: (system: string, imageDataUri: string) => Promise<string>
}

export type AnalyzeService = ReturnType<typeof createAnalyzeService>

export function createAnalyzeService({ anthropicApiKey, assets, complete }: Deps) {
  // Default completion: the real Anthropic vision call. Asks for the JSON object
  // directly and parses + validates the text ourselves (robust across SDK
  // versions rather than depending on a structured-output API), mirroring storyboard.
  const run =
    complete ??
    (async (system: string, imageDataUri: string): Promise<string> => {
      if (!anthropicApiKey) throw new Asset3dAnalyzeUnavailableError()
      const client = new Anthropic({ apiKey: anthropicApiKey })
      const [, mediaType, b64] = imageDataUri.match(/^data:(image\/[a-z+]+);base64,(.*)$/is) ?? []
      if (!b64) throw new Asset3dAnalyzeUnavailableError('unreadable concept image')
      const res = await client.messages.create({
        model: 'claude-opus-4-8',
        max_tokens: 4000,
        thinking: { type: 'adaptive' },
        system,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType as 'image/png', data: b64 } },
              { type: 'text', text: 'List the separable parts of this object as STRICT JSON.' },
            ],
          },
        ],
      })
      return res.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
    })

  async function analyze(userId: string, assetId: string): Promise<Asset3dPart[]> {
    // Unset key AND no injected completion → the endpoint exists but answers 502.
    if (!anthropicApiKey && !complete) throw new Asset3dAnalyzeUnavailableError()
    // Ownership (throws 404) + the concept image, BEFORE any model call.
    const concept = await assets.requireAssetConcept(userId, assetId)
    const raw = await run(SYSTEM_PROMPT, concept)
    const parsed = parseAnalyze(raw)
    return assets.replaceDraftParts(userId, assetId, parsed.parts)
  }

  return { analyze }
}

// Parse + validate the completion. Strips an accidental ```json fence, then
// validates against the shared schema so a malformed completion is a clean 502
// rather than a broken write to the aggregate.
export function parseAnalyze(raw: string): { parts: { name: string; description: string }[] } {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Asset3dAnalyzeUnavailableError('The analyzer returned an unreadable response')
  }
  const result = analyzeResponseSchema.safeParse(json)
  if (!result.success) throw new Asset3dAnalyzeUnavailableError('The analyzer returned an invalid response')
  return result.data
}
