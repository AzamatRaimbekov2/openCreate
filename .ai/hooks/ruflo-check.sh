#!/usr/bin/env bash
# SessionStart hook — keep the Ruflo runtime live for THIS project.
#  - Missing runtime (fresh copy or git clone)      -> bootstrap in background.
#  - Runtime stamped for a DIFFERENT path (cp -R'd) -> wipe stale state, rebuild.
#  - Runtime belongs to this path                   -> nothing to do.
# Bootstrap runs in the background so session start is never blocked.
# Disable with: export RUFLO_NO_AUTOBOOTSTRAP=1
ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
LOCK="$ROOT/.claude/.ruflo-bootstrap.lock"
LOG="$ROOT/.claude-flow-bootstrap.log"
INIT="$ROOT/.claude/skills/ruflo-bootstrap/assets/init-ruflo.sh"

has_runtime() { [ -f "$ROOT/.swarm/memory.db" ] || [ -f "$ROOT/.claude/memory.db" ]; }

if has_runtime; then
  OWNER="$(cat "$ROOT/.claude-flow/owner-path" 2>/dev/null)"
  # Belongs here, or legacy/unstamped runtime → leave it alone.
  if [ -z "$OWNER" ] || [ "$OWNER" = "$ROOT" ]; then
    exit 0
  fi
  # Stamp points elsewhere → this folder was copied. Drop path-bound state and rebuild.
  echo "<ruflo-activation priority=\"info\">Copied project detected (runtime was built for $OWNER). Rebuilding the Ruflo runtime for this location in the background.</ruflo-activation>"
  rm -rf "$ROOT/.claude-flow" "$ROOT/.swarm" "$ROOT/.claude/memory.db" "$ROOT/.claude/memory.db-shm" "$ROOT/.claude/memory.db-wal" 2>/dev/null
fi

# Opt-out.
if [ "${RUFLO_NO_AUTOBOOTSTRAP:-0}" = "1" ]; then
  echo "<ruflo-activation>Ruflo runtime not active and RUFLO_NO_AUTOBOOTSTRAP=1. Run it manually: bash .claude/skills/ruflo-bootstrap/assets/init-ruflo.sh</ruflo-activation>"
  exit 0
fi

# Already bootstrapping?
[ -f "$LOCK" ] && exit 0

if [ ! -f "$INIT" ]; then
  echo "<ruflo-activation>Ruflo runtime missing and bootstrap script not found at $INIT.</ruflo-activation>"
  exit 0
fi

# Launch bootstrap detached; clear the lock when done.
: > "$LOCK"
nohup bash -c "CLAUDE_PROJECT_DIR='$ROOT' bash '$INIT' >> '$LOG' 2>&1; rm -f '$LOCK'" >/dev/null 2>&1 &

cat <<MSG
<ruflo-activation priority="info">
Ruflo runtime is being built in the background (memory DB, swarm, daemon).
Progress log: .claude-flow-bootstrap.log — finishes in ~1-3 min on first run.
Coordination/MCP go fully live after you reopen Claude Code once and approve the
'claude-flow' MCP server. You can proceed now; swarm features come online shortly.
</ruflo-activation>
MSG
exit 0
