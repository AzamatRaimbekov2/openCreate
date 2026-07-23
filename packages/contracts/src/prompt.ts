// packages/contracts/src/prompt.ts
// Prompt enhancer wire contracts — the request/response for POST /api/prompt/enhance.
//
// A GENERIC, stateless, FREE text transform: it rewrites a user's rough shot idea
// into ONE detailed cinematic prompt for the Wan text-to-video model. It serves two
// consumers — the Cinema prompt-enhancer UI and the "soften & retry" action a
// content_blocked failure offers — so the only thing on the wire is text in, text
// out. No credits, no film scoping, no ids.
//
// UNLIKE the template/preset contracts, the prompt text DOES travel here in both
// directions: the client sends the rough idea and receives the finished prompt to
// show (and edit) in the composer. There is no prompt to keep server-side — the
// whole point of the endpoint is to hand the improved text back.
import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// Mode — what kind of rewrite the caller wants.
//   · 'enhance' (default): rough idea → one vivid, concrete cinematic prompt.
//   · 'soften':  the same, but additionally rewrites AWAY anything a provider
//     safety filter would block (violence, gore, explicit content, named public
//     figures, politics) while preserving the core scene and action. This is what
//     the "Смягчить и повторить" button calls after a content_blocked generation.
// An enum, not a boolean, so a third rewrite mode is an additive contract change.
// ─────────────────────────────────────────────────────────────────────────────
export const promptEnhanceModeSchema = z.enum(['enhance', 'soften'])
export type PromptEnhanceMode = z.infer<typeof promptEnhanceModeSchema>

// The request. `text` is bounded 1..2000 at the boundary: empty is nothing to
// rewrite, and 2000 is far more than a shot idea needs while capping the token
// bill of a free endpoint. `mode` defaults to 'enhance' so a caller that just
// wants a better prompt sends only { text }.
export const promptEnhanceInputSchema = z.object({
  text: z.string().min(1).max(2000),
  mode: promptEnhanceModeSchema.default('enhance'),
})
// z.infer gives the OUTPUT type: `mode` is always present after the default fills
// it, so the service never has to branch on undefined.
export type PromptEnhanceInput = z.infer<typeof promptEnhanceInputSchema>

// The response — and the shape the service validates the model's completion
// against. `.min(1)`: an empty prompt is a failed rewrite, not a success, so it is
// rejected at parse time and becomes a clean provider_error rather than a blank
// prompt handed to the composer.
export const promptEnhanceResultSchema = z.object({
  prompt: z.string().min(1),
})
export type PromptEnhanceResult = z.infer<typeof promptEnhanceResultSchema>
