// apps/api/src/modules/creator/service.ts
// openCreator's LOOP (ADR opencreator-agent D2/D4): sessions, the detached agent
// turn, the confirm gate and the staleness reaper. Every method takes `userId`
// first and scopes through requireSession — a foreign session id is
// indistinguishable from a missing one (the films/canvas rule).
//
// WHAT THIS FILE OWNS, AND WHAT IT DELIBERATELY DOES NOT:
//  · it owns the conversation (rows) and the control flow (which tool runs next);
//  · it owns NO money code. The only spend in the whole feature happens inside
//    tools.ts → generationService.create(), on the ordinary charge-at-submit path,
//    and only while the session's `confirmed` flag is 1.
//
// THE TURN IS DETACHED. POST answers 202 immediately and the loop runs as a void
// promise (the DeepInfra-submit precedent), because an agent turn is minutes of
// LLM + provider latency and no HTTP client should hold that open. Consequences,
// both handled below: a second turn for the same session must be refused (409),
// and an API restart leaves `running` rows that only settleStaleCreatorSessions
// can settle.
import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { creatorMessageContentSchema } from '@opencreate/contracts'
import type {
  CreatorMessage,
  CreatorMessageContent,
  CreatorSession,
  CreatorSessionDetail,
} from '@opencreate/contracts'
import type { FastifyBaseLogger } from 'fastify'
import type { Db } from '../../db/client'
import { creatorMessage, creatorSession } from '../../db/schema'
import { CreatorUnavailableError, completeWithBrains } from './brain'
import type { Brain, BrainToolCall, BrainToolSpec, BrainTurn } from './brain'
import type { CreatorTool } from './tools'

// Same error shape as every other module: statusCode + apiCode, so app.ts's
// central handler emits the standard envelope and the routes stay thin.
export class CreatorSessionNotFoundError extends Error {
  statusCode = 404
  apiCode = 'not_found'
  constructor() {
    super('Session not found')
    this.name = 'CreatorSessionNotFoundError'
  }
}

// 409: the request is well-formed but the session's current state forbids it —
// a second turn while one runs, or a confirm with nothing to confirm.
export class CreatorConflictError extends Error {
  statusCode = 409
  apiCode = 'conflict'
  constructor(message: string) {
    super(message)
    this.name = 'CreatorConflictError'
  }
}

// One user turn may execute at most this many brain calls. It is a circuit
// breaker, not a target: a loop that has taken 16 steps is stuck, and every step
// costs tokens. The turn ends with an honest message so the user can nudge it.
const MAX_STEPS = 16

// A `running` session older than this was abandoned by a process that is gone
// (restart, crash). Ten minutes is long enough for a slow video plan and short
// enough that a user is not staring at a dead spinner.
const STALE_AFTER_MS = 10 * 60 * 1000

// ── the system prompt ────────────────────────────────────────────────────────
// Russian, because the product is Russian and the agent talks to the user in the
// chat. It states three things the model cannot infer: what the product's parts
// are, the ORDER of work (free structure first, paid work only after a confirmed
// plan), and that reports must be short. The BUDGET LAW is repeated here for the
// model's benefit, but it is ENFORCED in tools.ts — a jailbroken prompt cannot
// spend a credit.
const SYSTEM_PROMPT = `Ты — openCreator, ИИ-режиссёр внутри продукта Ruflo. Пользователь описывает задачу словами («сделай ролик про лиса-космонавта»), а ты доводишь её до готовых кадров сам.

ЧТО ЕСТЬ В ПРОДУКТЕ:
· Персонажи (Soul) — переиспользуемые герои. create_entity создаёт персонажа, attach_entity_portrait даёт ему лицо из уже готовой картинки, после этого любой кадр с этим персонажем будет похож на предыдущие.
· Канвас — визуальная доска из нод и связей. create_canvas + add_canvas_nodes: ноды kind:'image'/'video' с промптом и modelId в config, связи — от исходного кадра к производному.
· Генерации — платные запуски моделей. start_generation ставит задачу, check_generation опрашивает результат.
· Каталог моделей — list_models: id, цена в кредитах, доступные пропорции, умеет ли модель держать референс персонажа.

ПОРЯДОК РАБОТЫ (обязательный):
1. Сам придумай сценарий и раскадровку — это твоя работа, а не работа инструмента. Держи сцены в голове и сразу превращай их в промпты.
2. Сделай бесплатные шаги: list_models, create_entity, create_canvas, add_canvas_nodes. Они не стоят кредитов, разрешения на них не нужно.
3. Перед ЛЮБОЙ платной работой вызови propose_plan: короткое описание, список пунктов с ценой в кредитах и итог. После этого ОСТАНОВИСЬ и жди подтверждения пользователя — start_generation до подтверждения будет отклонён.
4. После подтверждения выполняй план до конца: запускай кадры, опрашивай их через check_generation, при провале кадра переформулируй промпт или возьми другую модель и продолжай.
5. Если ошибка инструмента вернулась как {"error": ...} — это данные, а не конец: прочитай причину, исправь вызов и продолжай.

КАК ОТВЕЧАТЬ:
· Всегда по-русски, коротко и по делу. Одно-два предложения на шаг.
· В конце — что получилось и где это лежит (канвас, персонаж).
· Не спрашивай разрешения на бесплатные шаги и не пересказывай план дважды.
· Не выдумывай id: используй те, что вернули инструменты.`

// ── propose_plan: the gate's other half ──────────────────────────────────────
// Declared HERE, not in tools.ts, because it is not a wrapper over a service — it
// is a control-flow signal to this loop: write a plan card, revoke any previous
// confirmation, and stop the turn.
const PROPOSE_PLAN_SPEC: BrainToolSpec = {
  name: 'propose_plan',
  description:
    'Show the user what the paid work will cost, itemized in credits, and STOP. Call this before any start_generation. The user then confirms with one button and you continue from there.',
  inputSchema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'One short line: what will be produced' },
      items: {
        type: 'array',
        description: 'One entry per paid step: { label, credits }',
        items: {
          type: 'object',
          properties: { label: { type: 'string' }, credits: { type: 'number' } },
          required: ['label', 'credits'],
        },
      },
      totalCredits: { type: 'number', description: 'Sum of the items' },
    },
    required: ['summary', 'items', 'totalCredits'],
  },
}

const planInputSchema = z.object({
  summary: z.string().min(1).max(1000),
  items: z
    .array(z.object({ label: z.string().min(1).max(200), credits: z.number().int().min(0) }))
    .max(40),
  totalCredits: z.number().int().min(0),
})

// Russian labels for the step cards. A tool name is a fine key and a poor UI
// string; the card is the only place the user sees what the agent did.
const STEP_TITLES: Record<string, string> = {
  list_models: 'Смотрю модели и цены',
  create_entity: 'Создаю персонажа',
  attach_entity_portrait: 'Закрепляю лицо персонажа',
  create_canvas: 'Создаю канвас',
  add_canvas_nodes: 'Собираю кадры на канвасе',
  start_generation: 'Запускаю генерацию',
  check_generation: 'Проверяю результат',
}

type Deps = {
  db: Db
  // The ordered brain chain (app.ts builds it from config; tests inject fakes).
  brains: Brain[]
  tools: CreatorTool[]
  log: FastifyBaseLogger
}

export type CreatorService = ReturnType<typeof createCreatorService>

export function createCreatorService({ db, brains, tools, log }: Deps) {
  // In-process registry of the turns this process is running. The DB status is
  // the user-visible truth (and what the route's 409 reads); this Set only stops
  // one process from starting two loops for the same session.
  const running = new Set<string>()
  const specs: BrainToolSpec[] = [...tools.map((tool) => tool.spec), PROPOSE_PLAN_SPEC]
  const byName = new Map(tools.map((tool) => [tool.spec.name, tool]))

  function requireSession(userId: string, sessionId: string) {
    const row = db
      .select()
      .from(creatorSession)
      .where(and(eq(creatorSession.id, sessionId), eq(creatorSession.userId, userId)))
      .get()
    if (!row) throw new CreatorSessionNotFoundError()
    return row
  }

  function toSessionDto(row: typeof creatorSession.$inferSelect): CreatorSession {
    return {
      id: row.id,
      title: row.title,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  function messagesOf(sessionId: string): CreatorMessage[] {
    return (
      db
        .select()
        .from(creatorMessage)
        .where(eq(creatorMessage.sessionId, sessionId))
        // created_at is milliseconds and a single turn writes several messages
        // inside one millisecond, so the timestamp alone is NOT a total order —
        // rowid (SQLite's insertion sequence) is the tiebreaker that keeps a plan
        // card from rendering before the step that produced it.
        .orderBy(asc(creatorMessage.createdAt), sql`rowid`)
        .all()
        .map((row) => {
          const parsed = creatorMessageContentSchema.safeParse(safeJson(row.contentJson))
          // Defensive (the parseSoul precedent): one unreadable row must not 500
          // the whole conversation. We wrote every row through this same schema,
          // so this can only fire after a hand-edit or a future schema change.
          if (!parsed.success) return null
          return {
            id: row.id,
            role: row.role,
            content: parsed.data,
            createdAt: row.createdAt.toISOString(),
          }
        })
        .filter((message): message is CreatorMessage => message !== null)
    )
  }

  function toDetail(row: typeof creatorSession.$inferSelect): CreatorSessionDetail {
    return { ...toSessionDto(row), messages: messagesOf(row.id) }
  }

  function appendMessage(
    sessionId: string,
    role: 'user' | 'assistant',
    content: CreatorMessageContent,
  ): void {
    db.insert(creatorMessage)
      .values({
        id: randomUUID(),
        sessionId,
        role,
        contentJson: JSON.stringify(content),
        createdAt: new Date(),
      })
      .run()
  }

  // Every status write goes through here, so `updated_at` can never drift from
  // the status — the reaper's staleness clock depends on that pairing.
  function setStatus(
    sessionId: string,
    status: CreatorSession['status'],
    confirmed?: boolean,
  ): void {
    db.update(creatorSession)
      .set({
        status,
        ...(confirmed !== undefined ? { confirmed } : {}),
        updatedAt: new Date(),
      })
      .where(eq(creatorSession.id, sessionId))
      .run()
  }

  // ── the detached turn ──────────────────────────────────────────────────────

  function startTurn(userId: string, sessionId: string, kickoff?: string): void {
    if (running.has(sessionId)) return
    running.add(sessionId)
    void runTurn(userId, sessionId, kickoff)
      .catch((err) => {
        // runTurn already handles its own failures; this only catches a bug in
        // the handler itself, which must never become an unhandled rejection.
        log.error({ err, event: 'creator.turn_crashed', sessionId }, 'creator turn crashed')
        setStatus(sessionId, 'failed')
      })
      .finally(() => running.delete(sessionId))
  }

  // History ACROSS turns is the flattened text story: user text stays verbatim,
  // and each assistant card becomes one short line. Full tool fidelity lives only
  // INSIDE the current turn (the transcript built below), which keeps replay
  // simple and the context small — an agent re-reading twenty raw tool payloads
  // per step would pay for them every step.
  function historyTurns(sessionId: string): BrainTurn[] {
    return messagesOf(sessionId).map((message): BrainTurn =>
      message.role === 'user'
        ? { role: 'user', text: contentToText(message.content) }
        : { role: 'assistant', text: contentToText(message.content) },
    )
  }

  async function runTurn(userId: string, sessionId: string, kickoff?: string): Promise<void> {
    const turns: BrainTurn[] = historyTurns(sessionId)
    // The confirm kickoff is a USER turn on purpose: it is an instruction to act,
    // and the model must not mistake it for its own previous words.
    if (kickoff) turns.push({ role: 'user', text: kickoff })

    try {
      for (let step = 0; step < MAX_STEPS; step += 1) {
        const reply = await completeWithBrains(brains, SYSTEM_PROMPT, turns, specs, log)

        // No tool calls → the agent is talking, and the turn is over.
        if (reply.toolCalls.length === 0) {
          appendMessage(sessionId, 'assistant', {
            kind: 'text',
            text: (reply.text ?? 'Готово.').slice(0, 4000),
          })
          setStatus(sessionId, 'idle')
          return
        }

        // propose_plan wins over anything else in the same reply: it is a full
        // stop, so executing sibling calls after it would spend the user's
        // attention (or credits) on work they have not agreed to yet.
        const planCall = reply.toolCalls.find((toolCall) => toolCall.name === PROPOSE_PLAN_SPEC.name)
        if (planCall) {
          const plan = planInputSchema.safeParse(planCall.input)
          if (plan.success) {
            appendMessage(sessionId, 'assistant', { kind: 'plan', ...plan.data })
            // EVERY new plan revokes the previous confirmation (ADR D2): a
            // confirmation belongs to the plan it was given for.
            setStatus(sessionId, 'awaiting_confirm', false)
            return
          }
          // A malformed plan is an ordinary bad tool call: tell the model and let
          // it try again rather than stopping the turn on a formatting slip.
          turns.push(assistantTurn(reply))
          turns.push({
            role: 'toolResults',
            results: [
              {
                toolCallId: planCall.id,
                output: JSON.stringify({ error: 'invalid plan: expected { summary, items:[{label,credits}], totalCredits }' }),
              },
            ],
          })
          continue
        }

        // Ordinary tools: execute sequentially, card each one, then hand every
        // result back in ONE toolResults turn (both providers expect the answers
        // to a parallel reply together).
        const results: { toolCallId: string; output: string }[] = []
        for (const toolCall of reply.toolCalls) {
          const output = await executeCall(userId, sessionId, toolCall)
          results.push({ toolCallId: toolCall.id, output })
          appendMessage(sessionId, 'assistant', stepCard(toolCall.name, output))
        }
        turns.push(assistantTurn(reply))
        turns.push({ role: 'toolResults', results })
      }

      // Circuit breaker tripped. `idle` rather than `failed`: the work so far is
      // real and the user can simply say "продолжай".
      appendMessage(sessionId, 'assistant', {
        kind: 'text',
        text: 'Остановился: слишком много шагов за один заход. Напишите, что делать дальше.',
      })
      setStatus(sessionId, 'idle')
    } catch (err) {
      // Infrastructure failure (every brain down, or a bug). The message is
      // SANITIZED: CreatorUnavailableError's text was written to be shown;
      // anything else could carry internals, and this lands in the user's chat.
      const message =
        err instanceof CreatorUnavailableError ? err.message : 'The agent turn failed'
      log.warn(
        { event: 'creator.turn_failed', sessionId, reason: err instanceof Error ? err.name : 'unknown' },
        'creator turn failed',
      )
      appendMessage(sessionId, 'assistant', { kind: 'text', text: message })
      setStatus(sessionId, 'failed')
    }
  }

  // Execute one tool call. Unknown names are DATA too (a model can hallucinate a
  // tool), and the executors themselves never throw — see tools.ts.
  async function executeCall(
    userId: string,
    sessionId: string,
    toolCall: BrainToolCall,
  ): Promise<string> {
    const tool = byName.get(toolCall.name)
    if (!tool) return JSON.stringify({ error: `unknown tool: ${toolCall.name}` })
    return tool.execute(
      {
        userId,
        // Read the flag from the ROW on every call: the user may confirm while
        // this turn is running, and a new plan may revoke it. A captured boolean
        // would let a stale `true` spend.
        isConfirmed: () => {
          const row = db
            .select({ confirmed: creatorSession.confirmed })
            .from(creatorSession)
            .where(eq(creatorSession.id, sessionId))
            .get()
          return row?.confirmed === true
        },
        log,
      },
      toolCall.input,
    )
  }

  // ── public API ─────────────────────────────────────────────────────────────

  function createSession(userId: string, message: string): CreatorSessionDetail {
    const id = randomUUID()
    const now = new Date()
    db.insert(creatorSession)
      .values({
        id,
        userId,
        // The first task IS the label — a session has no name of its own, and a
        // truncated instruction reads better in the rail than "Новая сессия".
        title: message.trim().slice(0, 80),
        status: 'running',
        confirmed: false,
        createdAt: now,
        updatedAt: now,
      })
      .run()
    appendMessage(id, 'user', { kind: 'text', text: message.trim().slice(0, 4000) })
    startTurn(userId, id)
    return toDetail(requireSession(userId, id))
  }

  // Most recently touched first — a chat rail is a "what was I doing" list, and
  // it is exactly what idx_creator_session_user (user_id, updated_at DESC) serves.
  function listSessions(userId: string): CreatorSession[] {
    return db
      .select()
      .from(creatorSession)
      .where(eq(creatorSession.userId, userId))
      .orderBy(desc(creatorSession.updatedAt))
      .all()
      .map(toSessionDto)
  }

  function getSession(userId: string, sessionId: string): CreatorSessionDetail {
    return toDetail(requireSession(userId, sessionId))
  }

  function postMessage(userId: string, sessionId: string, message: string): CreatorSessionDetail {
    const row = requireSession(userId, sessionId)
    if (row.status === 'running')
      throw new CreatorConflictError('The agent is still working on this session')
    if (row.status === 'awaiting_confirm')
      throw new CreatorConflictError('Confirm or reject the proposed plan first')
    appendMessage(sessionId, 'user', { kind: 'text', text: message.trim().slice(0, 4000) })
    // A NEW instruction revokes any standing confirmation. Without this the gate
    // leaks: a session confirmed for plan A would let the agent spend on an
    // unrelated follow-up without asking again. One confirm buys one plan.
    setStatus(sessionId, 'running', false)
    startTurn(userId, sessionId)
    return toDetail(requireSession(userId, sessionId))
  }

  function confirm(userId: string, sessionId: string): CreatorSessionDetail {
    const row = requireSession(userId, sessionId)
    if (row.status !== 'awaiting_confirm')
      throw new CreatorConflictError('There is no plan awaiting confirmation')
    // The ONLY place `confirmed` becomes true, and it is a deliberate user act.
    setStatus(sessionId, 'running', true)
    appendMessage(sessionId, 'assistant', {
      kind: 'text',
      text: 'Бюджет подтверждён — выполняю план.',
    })
    startTurn(userId, sessionId, '[system] budget confirmed — execute the plan now')
    return toDetail(requireSession(userId, sessionId))
  }

  return { createSession, listSessions, getSession, postMessage, confirm }
}

// ── boot-time reaper ─────────────────────────────────────────────────────────

// A `running` session whose process is gone would spin forever in the UI. Called
// at boot next to settleStaleGenerations / settleStaleRenders. No money is
// involved: a generation the agent already started settles (and refunds) through
// its own poll path, independently of this conversation.
export function settleStaleCreatorSessions(
  db: Db,
  now: number,
  log?: Pick<FastifyBaseLogger, 'warn'>,
): void {
  const cutoff = new Date(now - STALE_AFTER_MS)
  const stale = db
    .select({ id: creatorSession.id, updatedAt: creatorSession.updatedAt })
    .from(creatorSession)
    .where(eq(creatorSession.status, 'running'))
    .all()
    // Filtered in TS rather than in SQL because `updated_at` is a drizzle
    // timestamp_ms column and the comparison reads clearly here; the row set is
    // bounded by "sessions currently running", which is tiny by construction.
    .filter((row) => row.updatedAt < cutoff)
  for (const row of stale) {
    db.update(creatorSession)
      .set({ status: 'failed', updatedAt: new Date(now) })
      .where(eq(creatorSession.id, row.id))
      .run()
    db.insert(creatorMessage)
      .values({
        id: randomUUID(),
        sessionId: row.id,
        role: 'assistant',
        contentJson: JSON.stringify({
          kind: 'text',
          text: 'Заход прервался (перезапуск сервера). Напишите, что делать дальше — продолжу.',
        }),
        createdAt: new Date(now),
      })
      .run()
    log?.warn({ event: 'creator.session_stale', sessionId: row.id }, 'stale creator session failed')
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

// The assistant turn as the provider itself produced it — `raw` carries the
// provider's own content blocks (signed thinking blocks included), which the
// Anthropic adapter must replay verbatim. See brain.ts.
function assistantTurn(reply: { text?: string; toolCalls: BrainToolCall[]; raw?: unknown }): BrainTurn {
  return {
    role: 'assistant',
    ...(reply.text !== undefined ? { text: reply.text } : {}),
    toolCalls: reply.toolCalls,
    ...(reply.raw !== undefined ? { raw: reply.raw } : {}),
  }
}

// One card → one line of flattened history. Enough for the model to know what it
// already did without re-reading the payloads.
function contentToText(content: CreatorMessageContent): string {
  switch (content.kind) {
    case 'text':
      return content.text
    case 'step':
      return `[шаг] ${content.tool}: ${content.title} — ${content.status}${
        content.detail ? ` (${content.detail})` : ''
      }`
    case 'plan':
      return `[план] ${content.summary} — итого ${content.totalCredits} кр.`
    case 'result':
      return content.text
  }
}

// A tool result (a JSON string) → the step card the user sees. The ids are lifted
// out so the card can LINK the artifact it produced; the cost is lifted out so a
// paid step shows its price where the money was spent.
function stepCard(toolName: string, output: string): CreatorMessageContent {
  const parsed = safeJson(output)
  const result = (parsed ?? {}) as Record<string, unknown>
  const error = typeof result.error === 'string' ? result.error : null
  return {
    kind: 'step',
    tool: toolName.slice(0, 60),
    title: (STEP_TITLES[toolName] ?? toolName).slice(0, 200),
    status: error ? 'error' : 'done',
    ...(error ? { detail: error.slice(0, 1000) } : {}),
    ...(typeof result.canvasId === 'string' ? { canvasId: result.canvasId.slice(0, 60) } : {}),
    ...(typeof result.entityId === 'string' ? { entityId: result.entityId.slice(0, 60) } : {}),
    ...(typeof result.generationId === 'string'
      ? { generationId: result.generationId.slice(0, 60) }
      : {}),
    ...(typeof result.costCredits === 'number' ? { costCredits: result.costCredits } : {}),
  }
}
