#!/usr/bin/env bash
# .ai/skills/run/assets/run-dev.sh
# Start the openCreate dev stack (Fastify API :8787 + Vite web :5173) and open
# the app in the default browser once BOTH are actually answering.
#
# WHY a script and not "just run pnpm dev": `pnpm dev` returns a stream, not an
# answer. Opening the browser right after it starts lands on a connection error
# — Vite needs a few seconds, tsx even longer on a cold start. This waits for
# real readiness (GET /health on the API, GET / on the web) before opening, so
# the browser never shows a dead tab.
#
# WHY it refuses to double-start: Vite silently falls forward to :5174 when 5173
# is taken. The app would load but every /api call would still be proxied by the
# FIRST instance — a confusing half-broken session. Detecting a live stack and
# reusing it is the only safe idempotent behaviour.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
WEB_URL="http://localhost:5173"
API_URL="http://localhost:8787"
RUNTIME_DIR="${TMPDIR:-/tmp}/opencreate-dev"
LOG="$RUNTIME_DIR/dev.log"
PID_FILE="$RUNTIME_DIR/dev.pid"
READY_TIMEOUT=90

mkdir -p "$RUNTIME_DIR"

open_browser() {
  if command -v open >/dev/null 2>&1; then
    open "$WEB_URL"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$WEB_URL"
  else
    echo "no browser opener found — open $WEB_URL by hand"
  fi
}

api_up() { curl -sf -o /dev/null --max-time 2 "$API_URL/health"; }
web_up() { curl -sf -o /dev/null --max-time 2 "$WEB_URL"; }

stop_stack() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid="$(cat "$PID_FILE")"
    # Negative PID = the whole process group. `pnpm --parallel` spawns two child
    # processes; killing only the parent would orphan them still holding the ports.
    kill -TERM "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
    rm -f "$PID_FILE"
    echo "stopped dev stack (pgid $pid)"
  else
    echo "no pid file — nothing this script started is running"
  fi
  # Ports may still be held by a stack started outside this script
  lsof -nP -iTCP:5173 -iTCP:8787 -sTCP:LISTEN 2>/dev/null || true
}

OPEN_BROWSER=1
case "${1:-}" in
  --stop) stop_stack; exit 0 ;;
  --no-open) OPEN_BROWSER=0 ;;
  "") ;;
  *) echo "usage: run-dev.sh [--stop|--no-open]" >&2; exit 2 ;;
esac

cd "$ROOT"

# ── Already running? Reuse it. ───────────────────────────────────────────────
if api_up && web_up; then
  echo "dev stack already up — reusing it"
  [[ "$OPEN_BROWSER" == 1 ]] && open_browser
  echo "web $WEB_URL   api $API_URL   log $LOG"
  exit 0
fi

# A half-up stack (one port live, the other dead) is worse than none: the web
# would render and every request would 502. Say so instead of stacking another.
if api_up || web_up; then
  echo "ERROR: only part of the stack is listening — 5173 and 8787 must both be free or both live." >&2
  lsof -nP -iTCP:5173 -iTCP:8787 -sTCP:LISTEN 2>/dev/null >&2 || true
  echo "fix: bash .ai/skills/run/assets/run-dev.sh --stop   (or kill the pid above)" >&2
  exit 1
fi

# ── Preflight ────────────────────────────────────────────────────────────────
if [[ ! -f "$ROOT/.env" ]]; then
  # config.ts walks up from cwd to the nearest .env; without it Zod fails fast
  # on RUNWARE_API_KEY/BETTER_AUTH_SECRET and the API dies on boot.
  echo "ERROR: $ROOT/.env is missing. Copy it: cp .env.example .env, then fill" >&2
  echo "       RUNWARE_API_KEY and BETTER_AUTH_SECRET (>=32 chars)." >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "ERROR: pnpm not found (this workspace is pnpm-only — never npm/yarn)." >&2
  exit 1
fi

if [[ ! -d "$ROOT/node_modules" ]]; then
  echo "node_modules missing — installing…"
  pnpm install --frozen-lockfile
fi

# ── Launch ───────────────────────────────────────────────────────────────────
# `set -m` gives the background job its OWN process group, which is what makes
# the group-kill in stop_stack able to take the API and web children with it.
set -m
: > "$LOG"
nohup pnpm dev >>"$LOG" 2>&1 &
DEV_PID=$!
set +m
echo "$DEV_PID" > "$PID_FILE"
echo "starting dev stack (pgid $DEV_PID) — log: $LOG"

# ── Wait for BOTH halves ─────────────────────────────────────────────────────
for _ in $(seq 1 "$READY_TIMEOUT"); do
  if api_up && web_up; then
    echo "ready: web $WEB_URL   api $API_URL"
    [[ "$OPEN_BROWSER" == 1 ]] && open_browser
    echo "stop with: bash .ai/skills/run/assets/run-dev.sh --stop"
    exit 0
  fi
  # The dev processes died (bad env, port grab, syntax error) — no point waiting
  # out the full timeout when there is a real error sitting in the log.
  if ! kill -0 "$DEV_PID" 2>/dev/null; then
    echo "ERROR: dev stack exited during startup. Last 40 log lines:" >&2
    tail -40 "$LOG" >&2
    rm -f "$PID_FILE"
    exit 1
  fi
  sleep 1
done

echo "ERROR: not ready after ${READY_TIMEOUT}s (api_up=$(api_up && echo yes || echo no) web_up=$(web_up && echo yes || echo no))." >&2
echo "Last 40 log lines:" >&2
tail -40 "$LOG" >&2
exit 1
