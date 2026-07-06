#!/usr/bin/env bash
# UserPromptSubmit hook — injects the mandatory synchronized skill chain on EVERY prompt.
# Whatever this script prints to stdout is added to the model's context for this turn.
# Keep it short, deterministic, and dependency-free so the template works after a plain copy.
#
# The hook receives the turn payload as JSON on stdin (field "prompt"). We read it, and if
# the prompt looks like a FRONTEND task, we append a hard, non-optional activation directive
# below the generic chain — so `frontend-agent` turns on automatically instead of relying on
# the model to notice. Disable the frontend auto-activation with: export FRONTEND_AUTOSTART=0

RAW="$(cat 2>/dev/null)"

cat <<'CHAIN'
<synchronized-agent-chain priority="must-follow">
This project runs all local agents/skills as ONE synchronized pipeline. For THIS prompt, before any substantive answer, file edit, or tool use, run the chain in order and skip a step only when it is genuinely irrelevant (say why if you skip):

0. ruflo runtime — the SessionStart hook auto-bootstraps the runtime (memory, swarm, daemon) in the background on a fresh copy; if it reported a failure, run the `ruflo-bootstrap` skill. Once up, prefer the Ruflo agents/swarm + `claude-flow` MCP tools for fan-out and coordination.
1. prompt-refiner — turn the raw request into a concrete working request (preserve scope, language, constraints).
2. project-documentation-wiki — read docs/wiki/index.md, schema.md, recent log.md, and nearby FEATURE.md; create the wiki scaffold if missing.
3. using-superpowers — route the task to the right workflow skill:
   - source/behavior change  -> test-driven-development (failing test FIRST)
   - bug / unclear failure    -> systematic-debugging
   - multi-step build         -> brainstorming -> writing-plans -> executing-plans
3.5 feature-architecture — for a new feature/module/endpoint/integration or boundary-crossing change: discuss design (scope, NFRs, options+tradeoffs), DRAW Mermaid diagrams (C4/sequence/ER), record an ADR in docs/wiki/decisions/ BEFORE coding (or dispatch the `architect` subagent).
4. Domain skill(s):
   - frontend/UI -> frontend-agent + frontend-error-ux (404, blocking error modal, crash fallback, offline overlay) + design-system-steward + frontend-design + ui-ux-pro-max
   - backend/API -> backend-engineering (router) -> the matching backend-* skill(s)
   - review      -> code-reviewer / backend-code-review / review-changes
5. behaviour-harness — for any observable behaviour change (feature/API/flow/logic/bugfix): acceptance criteria first → layered tests (contract/e2e/property) → mutation-test the tests → behaviour-judge subagent. Green tests are NOT proof of correct behaviour.
6. verification-before-completion — run the relevant checks (incl. behaviour-check.sh) BEFORE claiming done.
7. Update docs/wiki/ and the nearest FEATURE.md when behavior, architecture, APIs, UI, data, config, or tests changed.

Invoke skills with the Skill tool. This chain is mandatory and overrides any default to "just answer".
</synchronized-agent-chain>
CHAIN

# --- Frontend auto-activation -------------------------------------------------
# Detect a frontend/UI task from the prompt text and, if found, inject a hard directive.
if [ "${FRONTEND_AUTOSTART:-1}" != "0" ]; then
  # Extract the "prompt" field from the JSON payload; fall back to the raw stdin.
  PROMPT="$(printf '%s' "$RAW" | python3 -c 'import json,sys
try: print(json.load(sys.stdin).get("prompt",""))
except Exception: print("")' 2>/dev/null)"
  [ -z "$PROMPT" ] && PROMPT="$RAW"

  # RU + EN frontend signals. Case-insensitive, deliberately broad.
  FE_RE='react|component|компонент|интерфейс|вёрстк|верстк|tailwind|css|\.tsx|\.jsx|jsx|next\.?js|vite|tanstack|zustand|shadcn|стран(иц|ичк)|экран|screen|page|dashboard|дашборд|кнопк|button|модал|modal|навбар|navbar|sidebar|дровер|drawer|форм[аеуы]|\bform\b|стил(ь|и|ев)|дизайн|\bdesign\b|шрифт|\bfont\b|цвет|\bcolor\b|анимац|\blayout\b|responsive|адаптив|фронт|frontend|front-end|\bui\b|\bux\b|hook|хук(и|а)?\b|useeffect|usestate|роут(инг|ер)?|router|spa\b'

  if printf '%s' "$PROMPT" | grep -iqE "$FE_RE"; then
    cat <<'FE'

<frontend-autostart priority="must-follow">
DETECTED: this is a FRONTEND/UI task. Before ANY other action you MUST activate the frontend pipeline — this is not optional and overrides the generic chain's "skip if irrelevant":

1. Invoke Skill(frontend-agent) FIRST and announce "Using frontend-agent". Its Step 0 runs the ORCHESTRATOR (references/orchestrator.md): classify the prompt into ONE case and invoke only that case's ordered skill chain — do NOT fire all frontend skills at once. Announce "Frontend case: <case> → skills: <list>". Obey react-senior-standard.md non-bending rules (TS strict, no index keys, TanStack Router only, pnpm only, 4 UI states, test-first).
2. For any non-trivial build/edit/refactor, DISPATCH the `frontend-engineer` subagent (Agent tool) so the work is VISIBLE as a running agent — do not inline it silently.
3. The orchestrator picks companions per case (frontend-error-ux, design-system-steward, ui-ux-pro-max, frontend-design, react-19-patterns, nextjs-app-router-practices, typescript-react-routing) — only the ones the case needs, in order.
4. The `.claude/hooks/frontend-lint.sh` PostToolUse hook enforces the standard via ESLint on every .ts/.tsx edit — fix everything it reports before claiming done; run `pnpm lint && pnpm typecheck && pnpm test`.
</frontend-autostart>
FE
  fi
fi

exit 0
