#!/usr/bin/env bash
# Ruflo runtime bootstrap — idempotent. Materializes the per-machine runtime that
# CANNOT be copied with the folder: the memory database, an active swarm, and the
# background daemon. The static config (.claude/, .mcp.json, .agents/) already
# travels with the template, so we do NOT run `ruflo init` here — on a copied
# template it refuses anyway ("already initialized") because .claude/settings.json
# exists, and the runtime works fine without .claude-flow/config.yaml.
#
# Safe to run repeatedly. Requires: node + network (uses `npx ruflo@latest`).
set -uo pipefail

ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$ROOT" || exit 1
echo "[ruflo-bootstrap] project: $ROOT"

if ! command -v npx >/dev/null 2>&1; then
  echo "[ruflo-bootstrap] ERROR: node/npx not found. Install Node 18+ and re-run." >&2
  exit 1
fi

# 0) Global install. If `ruflo` is not on PATH, install it globally ONCE so every
#    later call (and the MCP server) uses the fast global binary instead of
#    re-downloading via `npx @latest` on every invocation.
if command -v ruflo >/dev/null 2>&1; then
  echo "[ruflo-bootstrap] ruflo already installed globally: $(command -v ruflo) ($(ruflo --version 2>/dev/null | head -1))"
else
  echo "[ruflo-bootstrap] ruflo not found globally — installing (npm i -g ruflo@latest)..."
  if npm install -g ruflo@latest; then
    echo "[ruflo-bootstrap] global install OK: $(command -v ruflo 2>/dev/null)"
  else
    echo "[ruflo-bootstrap] WARN: global install failed (permissions?). Falling back to npx." >&2
  fi
fi

# Prefer the global binary; fall back to npx (no @latest, so npx reuses the global
# install if present and only downloads when it is genuinely absent).
if command -v ruflo >/dev/null 2>&1; then
  RUFLO="ruflo"
else
  RUFLO="npx --yes ruflo"
fi
echo "[ruflo-bootstrap] using runtime command: $RUFLO"

# 1) Memory database (AgentDB). Stores absolute paths, so it is built locally, never copied.
if [ -f "$ROOT/.swarm/memory.db" ] || [ -f "$ROOT/.claude/memory.db" ]; then
  echo "[ruflo-bootstrap] memory database already present — skipping"
else
  echo "[ruflo-bootstrap] initializing memory database..."
  $RUFLO memory init || echo "[ruflo-bootstrap] memory init returned non-zero (continuing)"
fi

# 2) Swarm — start the coordination topology if none is active.
if $RUFLO swarm status 2>/dev/null | grep -q "No active swarm"; then
  echo "[ruflo-bootstrap] starting swarm (hierarchical-mesh, max 15)..."
  $RUFLO swarm init --topology hierarchical-mesh --max-agents 15 || echo "[ruflo-bootstrap] swarm init returned non-zero (continuing)"
else
  echo "[ruflo-bootstrap] swarm already active — skipping"
fi

# 3) Daemon — background workers for coordination/learning (idempotent; ruflo no-ops if running).
echo "[ruflo-bootstrap] starting daemon..."
$RUFLO daemon start || echo "[ruflo-bootstrap] daemon start returned non-zero (continuing)"

# 4) Stamp the owner path so a COPIED folder (which would carry stale, path-bound runtime)
#    is detected and rebuilt by the SessionStart hook instead of inheriting old state.
mkdir -p "$ROOT/.claude-flow"
printf '%s\n' "$ROOT" > "$ROOT/.claude-flow/owner-path"

echo "[ruflo-bootstrap] done. Reopen Claude Code in this folder so hooks/MCP/CLAUDE.md load,"
echo "[ruflo-bootstrap] and approve the 'claude-flow' MCP server when prompted."
