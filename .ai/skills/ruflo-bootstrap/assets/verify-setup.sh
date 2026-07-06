#!/usr/bin/env bash
# Doctor — confirm a copied Template Project is wired correctly and report what
# (if anything) is missing. Read-only. Run: bash .claude/skills/ruflo-bootstrap/assets/verify-setup.sh
ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"; cd "$ROOT" || exit 1
ok=0; warn=0
chk(){ if eval "$2"; then echo "  ✅ $1"; else echo "  ❌ $1"; ok=1; fi; }
soft(){ if eval "$2"; then echo "  ✅ $1"; else echo "  ⚠️  $1"; warn=1; fi; }

echo "Template Project setup check — $ROOT"
echo "[env]"
chk  "node present"                 "command -v node >/dev/null"
chk  "npx present"                  "command -v npx >/dev/null"

echo "[static assets]"
chk  ".claude/settings.json"        "[ -f .claude/settings.json ]"
chk  ".mcp.json (claude-flow)"      "[ -f .mcp.json ]"
chk  "CLAUDE.md"                    "[ -f CLAUDE.md ]"
chk  "agents present"              "[ \$(find .claude/agents -name '*.md' 2>/dev/null | wc -l) -gt 50 ]"
chk  "skills present"              "[ \$(find .claude/skills -name 'SKILL.md' 2>/dev/null | wc -l) -gt 50 ]"
chk  "commands present"           "[ \$(find .claude/commands -name '*.md' 2>/dev/null | wc -l) -gt 50 ]"

echo "[harness skills]"
for s in prompt-refiner project-documentation-wiki feature-architecture behaviour-harness sidecar-docs ruflo-bootstrap verification-before-completion; do
  chk "skill: $s" "[ -f .claude/skills/$s/SKILL.md ]"
done

echo "[hooks]"
chk  "inject-chain.sh"              "[ -f .claude/hooks/inject-chain.sh ]"
chk  "ruflo-check.sh"               "[ -f .claude/hooks/ruflo-check.sh ]"
chk  "sidecar-docs.cjs"             "[ -f .claude/hooks/sidecar-docs.cjs ]"
chk  "settings.json valid JSON"     "node -e \"JSON.parse(require('fs').readFileSync('.claude/settings.json'))\" 2>/dev/null"

echo "[ruflo runtime]  (read-only — does not start anything)"
soft "memory DB built"              "[ -f .swarm/memory.db ] || [ -f .claude/memory.db ]"
soft "swarm state present"          "[ -f .claude-flow/swarm/swarm-state.json ]"
soft "daemon running"               "[ -f .claude-flow/daemon.pid ] && ps -p \"\$(cat .claude-flow/daemon.pid 2>/dev/null)\" >/dev/null 2>&1"

echo
if [ $ok -ne 0 ]; then
  echo "RESULT: ❌ missing static pieces above — re-copy the folder."
  exit 1
elif [ $warn -ne 0 ]; then
  echo "RESULT: ⚠️  static config OK; runtime not built yet → run: bash .claude/skills/ruflo-bootstrap/assets/init-ruflo.sh"
  echo "(the SessionStart hook does this automatically on first open)"
  exit 0
else
  echo "RESULT: ✅ fully set up — static assets + runtime live."
  exit 0
fi
