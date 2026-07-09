// apps/api/src/modules/films/storyboard.ts
// CinemaStudio script→storyboard (ADR §"Script → storyboard"). An LLM breaks a
// free-text script into draft shots; each becomes a Shot with generationId=null
// and a promptPreset, so NOTHING is generated or charged until the user reviews
// and presses Generate per shot.
//
// Gated on ANTHROPIC_API_KEY exactly like COMFY_BASE_URL gates the wan-runpod
// provider: unset → the endpoint returns a clean provider_error, boot stays
// healthy, and every other CinemaStudio feature keeps working.
import Anthropic from '@anthropic-ai/sdk'
import { storyboardResponseSchema } from '@opencreate/contracts'
import type { CreateStoryboardInput, PromptPreset, Shot } from '@opencreate/contracts'
import type { FilmService } from './service'

// 502 provider_error — same envelope the generation path uses when a provider is
// unavailable, so the SPA can show one "try again later" message everywhere.
export class StoryboardUnavailableError extends Error {
  statusCode = 502
  apiCode = 'provider_error'
  constructor(message = 'Storyboarding is not configured') {
    super(message)
  }
}

const SYSTEM_PROMPT = `You are a film director's assistant. You break a short script or idea into a
sequence of distinct visual SHOTS for an AI video generator. Each shot is one continuous camera take.
Return STRICT JSON only — no prose, no markdown fences — matching exactly:
{"shots":[{"title":string,"prompt":string,"cameraShot":string,"cameraMotion":string,"durationSeconds":number}]}
Rules:
- "prompt" is a vivid, self-contained visual description of ONE shot (a text-to-video prompt). Do not
  reference other shots or use pronouns that depend on them.
- "cameraShot" is one of: none, wide, medium, close-up, extreme-close-up, aerial, low-angle.
- "cameraMotion" is one of: none, static, dolly-in, dolly-out, pan, orbit, handheld, crane.
- "durationSeconds" is an integer 3–8.
- Keep the number of shots reasonable for the script length.`

type Deps = {
  anthropicApiKey: string | null
  films: FilmService
  // Injectable so tests drive storyboard without a real Anthropic call.
  complete?: (system: string, user: string) => Promise<string>
}

export type StoryboardService = ReturnType<typeof createStoryboardService>

export function createStoryboardService({ anthropicApiKey, films, complete }: Deps) {
  // Default completion: the real Anthropic call. Uses adaptive thinking and asks
  // for the JSON object directly; we parse + validate the text ourselves (robust
  // across SDK versions rather than depending on a specific structured-output API).
  const runCompletion =
    complete ??
    (async (system: string, user: string): Promise<string> => {
      if (!anthropicApiKey) throw new StoryboardUnavailableError()
      const client = new Anthropic({ apiKey: anthropicApiKey })
      const res = await client.messages.create({
        model: 'claude-opus-4-8',
        max_tokens: 8000,
        thinking: { type: 'adaptive' },
        system,
        messages: [{ role: 'user', content: user }],
      })
      // Concatenate all text blocks (thinking blocks carry no text under the
      // default display and are skipped).
      return res.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
    })

  async function generate(
    userId: string,
    filmId: string,
    input: CreateStoryboardInput,
  ): Promise<Shot[]> {
    if (!anthropicApiKey && !complete) throw new StoryboardUnavailableError()
    // Ownership check up front (throws FilmNotFoundError 404 if not the caller's).
    films.getFilm(userId, filmId)

    const userMsg = [
      input.shotCount ? `Aim for about ${input.shotCount} shots.` : '',
      'Script / idea:',
      input.script,
    ]
      .filter(Boolean)
      .join('\n')

    const raw = await runCompletion(SYSTEM_PROMPT, userMsg)
    const parsed = parseStoryboard(raw)

    // Turn each proposed shot into a DRAFT shot: the preset carries the film's
    // chosen style plus the shot's camera intent; generationId stays null, so the
    // shot renders as an empty slot the user fills by pressing Generate.
    const created: Shot[] = []
    for (const s of parsed.shots) {
      const preset: PromptPreset = {
        ...(input.styleId ? { styleId: input.styleId } : {}),
        ...(s.cameraShot ? { cameraShot: s.cameraShot } : {}),
        ...(s.cameraMotion ? { cameraMotion: s.cameraMotion } : {}),
      }
      created.push(
        films.addShot(userId, filmId, {
          prompt: s.prompt,
          promptPreset: Object.keys(preset).length > 0 ? preset : null,
          durationMs: (s.durationSeconds ?? 5) * 1000,
        }),
      )
    }
    return created
  }

  return { generate }
}

// Parse + validate the LLM completion. Strips an accidental ```json fence, then
// validates against the shared schema so a malformed completion is a clean 502
// rather than a broken shot written to the timeline.
export function parseStoryboard(raw: string): { shots: import('@opencreate/contracts').StoryboardShot[] } {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new StoryboardUnavailableError('The storyboard model returned an unreadable response')
  }
  const result = storyboardResponseSchema.safeParse(json)
  if (!result.success) throw new StoryboardUnavailableError('The storyboard model returned an invalid response')
  return result.data
}
