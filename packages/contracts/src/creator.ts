// openCreator wire contracts (ADR opencreator-agent). A session is a persisted
// chat; every agent step is a MESSAGE with structured content, so the SPA
// re-renders the whole story from one GET and a reload loses nothing (D4).
import { z } from 'zod'

export const creatorSessionStatusSchema = z.enum([
  // idle: turn finished, agent waits for the next user message
  'idle',
  // running: a detached agent turn is executing right now
  'running',
  // awaiting_confirm: the agent posted a plan and is blocked on the budget gate
  'awaiting_confirm',
  // failed: the turn died (provider error / staleness) — user may retry with a message
  'failed',
])
export type CreatorSessionStatus = z.infer<typeof creatorSessionStatusSchema>

// One chat entry. Discriminated by `kind` so cards render without guessing:
//  text   — the user's request or the agent's prose answer
//  step   — one executed tool (shown as a progress card); ids let the card link
//           the produced artifact (canvas/entity/generation)
//  plan   — the budget gate: itemized credits + total, awaits confirm (D2)
//  result — the final card with artifact links
export const creatorMessageContentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), text: z.string().max(4000) }),
  z.object({
    kind: z.literal('step'),
    tool: z.string().max(60),
    title: z.string().max(200),
    status: z.enum(['done', 'error']),
    detail: z.string().max(1000).optional(),
    canvasId: z.string().max(60).optional(),
    entityId: z.string().max(60).optional(),
    generationId: z.string().max(60).optional(),
    costCredits: z.number().int().optional(),
  }),
  z.object({
    kind: z.literal('plan'),
    summary: z.string().max(1000),
    items: z.array(z.object({ label: z.string().max(200), credits: z.number().int().min(0) })).max(40),
    totalCredits: z.number().int().min(0),
  }),
  z.object({
    kind: z.literal('result'),
    text: z.string().max(2000),
    canvasId: z.string().max(60).optional(),
    entityId: z.string().max(60).optional(),
  }),
])
export type CreatorMessageContent = z.infer<typeof creatorMessageContentSchema>

export const creatorMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  content: creatorMessageContentSchema,
  createdAt: z.string(),
})
export type CreatorMessage = z.infer<typeof creatorMessageSchema>

export const creatorSessionSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: creatorSessionStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type CreatorSession = z.infer<typeof creatorSessionSchema>

export const creatorSessionDetailSchema = creatorSessionSchema.extend({
  messages: z.array(creatorMessageSchema),
})
export type CreatorSessionDetail = z.infer<typeof creatorSessionDetailSchema>

export const creatorSessionListSchema = z.object({ items: z.array(creatorSessionSchema) })
export type CreatorSessionList = z.infer<typeof creatorSessionListSchema>

// Session opens WITH the first task; same bounds as a generation prompt.
export const createCreatorSessionInputSchema = z.object({
  message: z.string().min(2).max(2000),
})
export type CreateCreatorSessionInput = z.infer<typeof createCreatorSessionInputSchema>

export const postCreatorMessageInputSchema = createCreatorSessionInputSchema
export type PostCreatorMessageInput = CreateCreatorSessionInput
