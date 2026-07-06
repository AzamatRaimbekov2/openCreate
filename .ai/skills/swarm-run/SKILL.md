---
name: swarm-run
description: Run a real, VISIBLE multi-agent swarm for a task by orchestrating it through the built-in ultracode Workflow tool, while using ruflo (claude-flow) as the shared persistent memory backend. Use when the user wants to fan a task out to several sub-agents in parallel AND clearly see which agents were created (in /workflows), with results shared between agents and remembered across sessions. Triggers: "/swarm-run", "запусти рой", "мультиагентно", "распараллель на агентов", "swarm this", "fan out with visibility".
---

# swarm-run — visible multi-agent swarm (ultracode orchestrator + ruflo memory)

## Why this exists

`ruflo`'s own `swarm_init` / `agent_spawn` do **not** produce real, independently-running,
visible sub-agents — the work still funnels through one Claude, and you cannot watch the
agents live. The built-in **ultracode `Workflow` tool** DOES: it spawns real parallel
sub-agents (up to ~16 concurrent) that appear in `/workflows`.

So the architecture is inverted from what users expect:

- **ultracode `Workflow` = the orchestrator** (real, visible, parallel sub-agents).
- **ruflo = the shared memory backend** (each agent reads/writes `mcp__claude-flow__memory_*`,
  so results are shared between agents and persist across sessions).

Direction matters: ruflo can never call ultracode. Only the reverse works — ultracode agents
call ruflo's MCP memory tools. Do not try to make ruflo drive the workflow.

```
          ultracode Workflow (dirijabl, VISIBLE in /workflows)
                          │
        ┌─────────────┬───┴────────┬─────────────┐
        ▼             ▼            ▼             ▼
     agent#1       agent#2      agent#3       agent#N     ← real parallel sub-agents
        │             │            │             │
        └─────────────┴──────┬─────┴─────────────┘
                             ▼
             ruflo memory (.swarm/memory.db)             ← shared + persistent
        mcp__claude-flow__memory_store / memory_search
```

## When to use

- User wants several sub-agents working a task in parallel **and** wants to SEE them.
- User wants agent results shared and remembered between sessions.
- Task genuinely decomposes into independent chunks (review dimensions, per-file work,
  research angles, build+test+review). For a single small edit, do NOT use this — just do it.

## Precondition (check once, fast)

The ruflo memory backend must exist. Verify:
- `.swarm/memory.db` or `.claude/memory.db` exists, AND
- the `mcp__claude-flow__memory_store` tool is available (load via ToolSearch:
  `select:mcp__claude-flow__memory_store,mcp__claude-flow__memory_search`).

If missing → run the `ruflo-bootstrap` skill first (it installs ruflo globally and builds
the memory DB). If the user chose "no memory", skip all ruflo calls and run pure ultracode.

## How to run

1. **Refine the task** into a concrete objective and a work-list of independent items
   (dimensions / files / angles / stages). Scout inline first if the list isn't known yet.

2. **Pick a memory namespace** for this run, e.g. `swarm/<short-task-slug>`. Pass it to every
   agent so their writes are grouped and findable later.

3. **Author an ultracode Workflow** (call the `Workflow` tool) using this shape. Every agent
   is instructed to (a) `memory_search` for relevant prior context first, and (b) `memory_store`
   its result under the namespace. Use `pipeline()` by default; `parallel()` only when you need
   all results together.

```js
export const meta = {
  name: 'swarm-run',
  description: 'Visible parallel sub-agents (ultracode) sharing ruflo memory',
  phases: [{ title: 'Work' }, { title: 'Verify' }],
}
const NS = args.namespace            // e.g. "swarm/audit-2026"
const ITEMS = args.items             // work-list decided by the caller

const MEM = `Before starting, call mcp__claude-flow__memory_search with your topic under ` +
  `namespace "${NS}" to reuse prior findings. When done, call mcp__claude-flow__memory_store ` +
  `(namespace "${NS}", a descriptive key, your result as value) so peers and future sessions see it.`

const results = await pipeline(
  ITEMS,
  item => agent(`${item.prompt}\n\n${MEM}`, { label: `work:${item.key}`, phase: 'Work', schema: item.schema }),
  (res, item) => agent(
    `Adversarially verify this result for "${item.key}": ${JSON.stringify(res)}. ${MEM}`,
    { label: `verify:${item.key}`, phase: 'Verify', schema: VERDICT }
  ).then(v => ({ item: item.key, res, verdict: v }))
)
return results.filter(Boolean)
```

4. **Persist the synthesis.** After the workflow returns, store a final summary under the same
   namespace (`memory_store`) so the next session recalls the whole run, not just fragments.

5. **Report to the user** what ran: list each sub-agent (label), what it returned, and confirm
   the memory keys written. Point them at `/workflows` to watch live next time.

## Notes

- The user sees every sub-agent live in `/workflows` — that is the whole point ("чётко видеть,
  какие мультиагенты созданы"). Never silently cap the agent count; `log()` anything dropped.
- Do NOT use ruflo's `consensus` / `neural` / `byzantine` tools — treat them as unavailable.
  Only `memory_store` / `memory_search` (and optionally `memory_list`) are load-bearing.
- Scale to the ask: a few agents for a quick fan-out, a larger pool + verify pass for "audit"
  or "be thorough". Match effort to the request.
