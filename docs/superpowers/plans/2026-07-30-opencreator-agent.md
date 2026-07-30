# openCreator Agent Implementation Plan (phases 1-2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build openCreator — the `/creator` chat agent that writes a scenario, creates a character, assembles a canvas and (after ONE budget confirmation) autonomously runs the generations — per the accepted ADR `docs/wiki/decisions/opencreator-agent.md`.

**Architecture:** Server-side agent loop in `apps/api/src/modules/creator/`; tools are thin wrappers over EXISTING services (entities/canvas/generations/catalog) with the caller's userId — zero new money code. Brain = neutral ToolCall layer over Anthropic tool-use (primary, SDK already a dependency) → DeepSeek function-calling on DeepInfra (fallback). Sessions/messages persist in SQLite; the SPA polls. Budget gate: charging tools are STRUCTURALLY disabled until the session is confirmed.

**Tech Stack:** Fastify + drizzle/SQLite, `@anthropic-ai/sdk` (present), zod contracts, React 19 + TanStack Query + Zustand, Vitest/RTL. TDD.

---

## File Structure

```
packages/contracts/src/
  creator.ts / creator.test.ts     (NEW: session/message DTOs, content union, inputs)
  index.ts                          (MODIFY: export)

apps/api/src/
  db/ddl.ts                         (MODIFY: + CREATOR_DDL)
  db/client.ts                      (MODIFY: exec)
  db/schema.ts                      (MODIFY: creatorSession, creatorMessage)
  modules/creator/brain.ts          (NEW: neutral ToolCall layer + Anthropic/DeepSeek adapters + chain)
  modules/creator/tools.ts          (NEW: tool registry over services)
  modules/creator/service.ts        (NEW: sessions, detached agent loop, confirm gate, stale reaper)
  modules/creator/routes.ts         (NEW)
  app.ts                            (MODIFY: wire deps + register)

apps/api/test/
  creator-brain.test.ts             (adapters with injected fakes)
  creator-tools.test.ts             (executors with fake services)
  creator.test.ts                   (HTTP: CRUD, 202/409, confirm gate, ownership)

apps/web/src/modules/Creator/
  model/api.ts                      (sessions hooks + 2s polling)
  model/creatorStore.ts             (draft input; NO server truth — TanStack owns it)
  components/CreatorChat.tsx        (message list + 4 states)
  components/MessageCard.tsx        (text / step / plan+confirm / result cards)
  components/CreatorComposer.tsx    (textarea + EnhanceButton (MANDATORY) + send)
  components/SessionList.tsx        (left rail, CinemaLibrary pattern)
  index.ts
apps/web/src/routes/
  _shell.creator.tsx                (NEW: /creator page)
  (AppShell nav link + en/ru locale keys)
```

---

## Task 1: Creator contracts

**Files:** Create `packages/contracts/src/creator.ts`, `creator.test.ts`; modify `index.ts`.

Schemas (complete — copy verbatim):

```typescript
// packages/contracts/src/creator.ts
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
```

Tests: content union accepts each kind / rejects unknown kind; detail parses a full
session with mixed messages; input bounds (1-char message refused). Export
`./creator` from index.ts (ordering immaterial — zod only). Commit:
`feat(creator): wire contracts for the agent chat`.

---

## Task 2: DB tables

**Files:** `apps/api/src/db/ddl.ts` (+CREATOR_DDL), `db/client.ts` (exec), `db/schema.ts`.

```sql
-- CREATOR_DDL (same idempotent contract as CANVAS_DDL)
CREATE TABLE IF NOT EXISTS creator_session (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  -- Budget gate (ADR D2): flipped to 1 by /confirm, back to 0 by every new plan.
  -- Charging tools are STRUCTURALLY refused while 0 — see tools.ts.
  confirmed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_creator_session_user ON creator_session(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS creator_message (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES creator_session(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_creator_message_session ON creator_message(session_id, created_at);
```

Drizzle mirrors (timestamp_ms mode, enums in TS like canvas tables). Boot test:
`pnpm vitest run test/db-ddl.test.ts test/db.test.ts`. Commit:
`feat(creator): session/message tables`.

---

## Task 3: Brain — neutral ToolCall layer + two adapters + chain

**File:** `apps/api/src/modules/creator/brain.ts`, test `apps/api/test/creator-brain.test.ts`.

Neutral types (exact contract for the loop):

```typescript
export type BrainToolSpec = {
  name: string
  description: string
  // JSON Schema for the tool input (both providers take it near-verbatim)
  inputSchema: Record<string, unknown>
}
export type BrainToolCall = { id: string; name: string; input: unknown }
// The loop's transcript entry — provider-neutral. `toolResults` answers the
// PREVIOUS assistant turn's calls (Anthropic: user-role tool_result blocks;
// DeepSeek: role:'tool' messages).
export type BrainTurn =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text?: string; toolCalls?: BrainToolCall[] }
  | { role: 'toolResults'; results: { toolCallId: string; output: string }[] }
export type BrainReply = { text?: string; toolCalls: BrainToolCall[] }
export type Brain = {
  id: 'anthropic' | 'deepseek'
  complete(system: string, turns: BrainTurn[], tools: BrainToolSpec[]): Promise<BrainReply>
}
export class CreatorUnavailableError extends Error { statusCode = 502; apiCode = 'provider_error' }
export function buildBrainChain(anthropicApiKey: string | null, deepinfraToken: string | null): Brain[]
```

- **Anthropic adapter**: `@anthropic-ai/sdk` (already a dep — see
  modules/films/storyboard.ts:54 for construction). `client.messages.create({
  model: 'claude-sonnet-5', max_tokens: 2048, system, messages, tools })` where
  tools = `[{ name, description, input_schema }]`; map turns: toolResults →
  `{ role:'user', content:[{ type:'tool_result', tool_use_id, content }] }`;
  assistant toolCalls → `content:[{type:'tool_use',...}]`. Parse reply content
  blocks: text → text, tool_use → toolCalls. Inject the client factory for tests.
- **DeepSeek adapter**: fetch `https://api.deepinfra.com/v1/openai/chat/completions`
  (bearer token) — REUSE the exact model id modules/prompt/enhance.ts uses for
  DeepSeek; OpenAI `tools:[{type:'function',function:{name,description,parameters}}]`,
  toolResults → `{ role:'tool', tool_call_id, content }`. Parse
  `choices[0].message.{content,tool_calls}` (JSON.parse arguments defensively —
  a malformed arguments string becomes a failed call, not a crash). Inject fetch.
- **Chain**: try adapters in order; ANY throw → next; all failed/none configured →
  `CreatorUnavailableError` (central handler maps 502, same as enhancer).

Tests: each adapter's request mapping (system/tools/turn shapes asserted on the
injected fake), reply parsing (text-only, tool_use, malformed DeepSeek arguments),
chain failover order, empty chain → CreatorUnavailableError. Commit:
`feat(creator): provider-neutral brain — anthropic tool-use + deepseek fallback`.

---

## Task 4: Tools — registry over existing services

**File:** `apps/api/src/modules/creator/tools.ts`, test `apps/api/test/creator-tools.test.ts`.

Contract:

```typescript
export type ToolContext = {
  userId: string
  // читается перед КАЖДЫМ платным вызовом — см. бюджет-гейт
  isConfirmed: () => boolean
  log: pino.Logger  // (the fastify logger type the services already take)
}
export type ToolExecutor = (ctx: ToolContext, input: unknown) => Promise<string> // JSON string result for the LLM
export type CreatorTool = { spec: BrainToolSpec; execute: ToolExecutor }
export function buildCreatorTools(deps: {
  entities: EntityService
  canvas: CanvasService
  generations: GenerationService
}): CreatorTool[]
```

Tools (each validates its input with a LOCAL zod schema; every executor returns a
compact JSON string — the LLM reads it):

1. `list_models` — image+video rows from the catalog (id, name, credits table,
   referenceMode) — pure `CATALOG` read, no deps.
2. `write_scenario` — NOT a tool. The brain writes scenarios in its head; a tool
   would be a second LLM call for nothing. (The system prompt instructs the agent
   to produce scenes itself.) — deliberately absent; keep the note in the file.
3. `create_entity { name, description }` — **Check first**: the exact
   EntityService create signature (apps/api/src/modules/entities/service.ts) and
   what the Cinema "make character" flow calls (its API layer:
   apps/web/src/modules/Cinema/model/makeCharacterApi.ts shows the HTTP shape).
   Returns `{ entityId }`.
4. `attach_entity_portrait { entityId, generationId }` — the copyGeneratedAsset
   seam (entities/service.ts:159 area, default-deny checks already inside).
   Gives the character a face so canvas character wiring works.
5. `create_canvas { title }` → `{ canvasId }` (canvas service createCanvas).
6. `add_canvas_nodes { canvasId, nodes: [{id,kind,position,config}], edges }` —
   ONE updateCanvas call (full-doc semantics: read current detail, append,
   write back). Node/edge shapes reuse the canvas contracts schemas.
7. `start_generation { modelId, prompt, aspectRatio, duration?, entityId?, inputGenerationId?, canvasNodeRef? }`
   — **THE BUDGET GATE LIVES HERE (ADR D2), not in the prompt**: if
   `!ctx.isConfirmed()` return `{"error":"budget_not_confirmed — propose a plan
   and wait for the user"}` WITHOUT calling the service. Otherwise map to
   `generations.create(userId, {...}, ctx.log)` (entityId → entityRefs +
   `[[e1]] ` prefix exactly like canvas buildRunInput). Returns
   `{ generationId, status, costCredits }`. `canvasNodeRef` (optional
   `{canvasId, nodeId}`) appends the generationId to that node's history via
   updateCanvas — so the board shows the agent's runs.
8. `check_generation { generationId }` — generations.get (the poll that settles);
   returns `{ status, mediaUrl?, errorMessage? }`.

Tests with fakes: budget gate refuses before confirm and passes after; input
validation errors return `{"error":...}` strings (never throw — a tool crash
must reach the LLM as data, not kill the loop); the entityId→entityRefs mapping;
add_canvas_nodes append semantics. Commit: `feat(creator): agent tools over
existing services — budget gate structural`.

---

## Task 5: Service (loop + confirm + reaper) + routes + wiring

**Files:** `modules/creator/service.ts`, `modules/creator/routes.ts`, `app.ts`, test `apps/api/test/creator.test.ts`.

Service contract:

```typescript
export function createCreatorService(deps: {
  db: Db
  brains: Brain[]
  tools: CreatorTool[]
  log: pino.Logger
}) {
  return { createSession, listSessions, getSession, postMessage, confirm }
}
```

Loop rules (the heart — implement exactly):
- `createSession(userId, message)` / `postMessage` / `confirm` write their rows,
  set status `running`, then START A DETACHED TURN (void promise + in-process
  `Set<string>` of running session ids — the deepinfra-client detached pattern;
  a second turn for the same session while one runs → 409 at the route).
- A turn: load messages → map to BrainTurn[] (user text → user; assistant
  step/plan/result → assistant text summaries + toolCalls/toolResults are NOT
  reconstructed — instead keep an in-turn transcript: history across turns is
  the flattened text story, full tool fidelity lives only INSIDE one turn; this
  keeps replay simple and the context small).
- Inside a turn: up to `MAX_STEPS = 16` brain calls. Each reply:
  - toolCalls empty → append assistant `{kind:'text'}` → status `idle` → done.
  - contains `propose_plan` (a SPECIAL tool declared in the loop, not tools.ts:
    spec `{summary, items:[{label,credits}], totalCredits}`) → append
    `{kind:'plan'}`, set `confirmed=0`, status `awaiting_confirm`, STOP the turn.
  - other calls → execute sequentially; after each, append `{kind:'step'}`
    (status done/error + ids parsed from the result JSON) and push the
    toolResult into the in-turn transcript.
- `confirm(userId, sessionId)`: only from `awaiting_confirm` (else conflict
  error → 409); set `confirmed=1`, append assistant text «Бюджет подтверждён…»,
  start a turn whose first user-turn line is the literal
  `[system] budget confirmed — execute the plan now`.
- Any brain/tool infrastructure throw → status `failed` + assistant text with a
  SANITIZED message (CreatorUnavailableError.message is safe; anything else →
  'agent turn failed'). Credits never leak: only start_generation spends, and it
  spends through the ordinary charge path.
- `settleStaleCreatorSessions(db, now)`: `running` older than 10 min by
  updated_at → `failed` + a message (boot-time sweep next to
  settleStaleGenerations in app.ts).
- SYSTEM prompt (Russian, in service.ts as a const): who the agent is, the
  product map, the tool law («сначала бесплатные шаги; перед платными —
  propose_plan и жди подтверждения; после подтверждения выполняй план до конца;
  отчитывайся коротко»), and «отвечай пользователю по-русски».

Routes (all `requireUser`, strict bucket 10/min on POSTs — LLM tokens):
`POST /api/creator/sessions` {message} → 202 detail ·
`GET /api/creator/sessions` → list ·
`GET /api/creator/sessions/:id` → detail (the SPA poll) ·
`POST /api/creator/sessions/:id/messages` → 202 detail (409 if running/awaiting) ·
`POST /api/creator/sessions/:id/confirm` → 202 detail (409 unless awaiting_confirm).

app.ts wiring (after canvas): build tools from the EXISTING service instances
(entityService, canvasService, generationService are all in scope), brains from
`deps.config.anthropicApiKey` / `deps.config.deepinfraToken`; register routes;
boot sweep. Add `anthropicApiKey` override already exists in build-test-app.

HTTP tests (fake brain injected — **add `creatorBrains?: Brain[]` to
TestAppOverrides/AppDeps** so tests script the LLM): 401s; create session → 202 +
first user message; scripted brain that calls list_models then answers → poll
shows step+text and status idle; scripted propose_plan → awaiting_confirm and
start_generation REFUSED before confirm (fakeRunware asserts no call, balance
unchanged); confirm → 202 → generation runs (fakeRunware imageInference) and
charges; 409 on double-post while running; foreign session 404. Commit:
`feat(creator): agent loop, budget gate, sessions API`.

---

## Task 6-8: Frontend (modules/Creator + /creator route)

Patterns to mirror (all in-session precedents): api layer + polling → Compare/
Canvas `model/api.ts`; 2s polling of the detail while status is running/
awaiting_confirm (`refetchInterval` callback like useNodeGeneration); store only
for the composer draft (server truth in TanStack).

- **Task 6** `model/api.ts`: useCreatorSessions, useCreatorSession(id) (poll 2s
  while running/awaiting), useCreateSession, usePostMessage, useConfirmPlan —
  each mutation writes the returned detail into the query cache (setQueryData,
  no refetch storm). Tests for the polling predicate.
- **Task 7** components (test-first, 4 states):
  - `SessionList` — CinemaLibrary pattern (skeleton/error/empty/data).
  - `MessageCard` — text (user right-aligned steel, agent left), step
    (tool icon + title + status word in glow-amber/green/red + optional cost),
    plan (itemized list + total + PRIMARY «Подтвердить· N кр» button firing
    useConfirmPlan; disabled after), result (links: canvasId →
    `/canvas/$canvasId`, entityId → `/soul/$entityId`).
  - `CreatorChat` — the scroll column; auto-scroll to bottom on new messages;
    «агент работает…» pulse row while running.
  - `CreatorComposer` — textarea + **EnhanceButton (mandatory, wrapper-div
    absolute placement — see ImageNode.tsx.md gotcha)** + send; disabled while
    running/awaiting (plan card is the only next action then).
- **Task 8** route `_shell.creator.tsx` (list rail + active chat, requireSession),
  AppShell nav item, en+ru keys under `creator.*` namespace. NOTE the AppShell
  and locale files carry other agents' uncommitted work — stage ONLY your hunks
  (hash-object + update-index, the canvas-character precedent).

Commits per task: `feat(creator-web): sessions api + polling`,
`feat(creator-web): chat cards — plan gate, steps, results`,
`feat(creator-web): /creator page + nav`.

---

## Task 9: Gate + live check + docs

- Full gate: contracts + api + web (lint/typecheck/vitest/build).
- Live (dev stack, browser): create session «сделай одну картинку лиса на
  канвасе» → watch steps → plan card → confirm → generation runs (≤5 credits)
  → result card links to the canvas. The API needs ANTHROPIC_API_KEY in .env —
  if absent, verify the clean 502 path instead and SAY SO in the report.
- Docs: apps/web/FEATURE.md «openCreator» section · docs/wiki/log.md dated RU
  entry · ADR gets an implementation note. Sidecars everywhere (hook scaffolds).

---

## Self-review notes (already applied)

- `write_scenario` was cut from tools (the brain writes scenes itself — one
  LLM call, not two); the ADR's tool list stays honest via the plan card.
- The budget gate is enforced in CODE (tools.ts + confirmed flag), not by
  prompt discipline — a jailbroken prompt cannot spend.
- History across turns is flattened text (small context, simple replay); full
  tool fidelity lives inside a single turn only.
- `report_progress` from the ADR became implicit: every executed tool IS a step
  message — a dedicated tool would double-log.
