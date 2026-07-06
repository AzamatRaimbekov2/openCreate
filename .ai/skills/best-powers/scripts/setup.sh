#!/usr/bin/env bash
# best-powers: replicate the full Ruflo / Claude Code "best powers" setup
# from the master AI-TOOLS template into the current (or given) folder.
#
# Usage: setup.sh [target-folder] [--no-mcp] [--no-doctor] [--force]
#   target-folder  defaults to $PWD
#   --no-mcp       skip registering the claude-flow MCP server
#   --no-doctor    skip running `ruflo doctor --fix`
#   --force        overwrite an existing CLAUDE.md/AGENTS.md without warning
set -euo pipefail

# Master resolution (works on ANY device):
#   1. $BEST_POWERS_MASTER if set
#   2. local author workspace, if present
#   3. ~/ruflo-powers — auto-cloned/updated from GitHub
REPO_URL="https://github.com/AzamatRaimbekov/ruflo-powers.git"
MASTER="${BEST_POWERS_MASTER:-}"
if [[ -z "$MASTER" ]]; then
  if [[ -d "/Users/raimbekov/Desktop/AI-TOOLS/.ai" ]]; then
    MASTER="/Users/raimbekov/Desktop/AI-TOOLS"
  else
    MASTER="$HOME/ruflo-powers"
    if [[ -d "$MASTER/.git" ]]; then
      echo "▶ Updating master clone ($MASTER)…"
      git -C "$MASTER" pull --ff-only 2>/dev/null || echo "  • pull failed — using existing copy"
    else
      echo "-> Master not found locally - cloning ${REPO_URL} -> ${MASTER} ..."
      git clone --depth 1 "$REPO_URL" "$MASTER"
    fi
  fi
fi
TARGET=""
DO_MCP=1; DO_DOCTOR=1; FORCE=0

for arg in "$@"; do
  case "$arg" in
    --no-mcp)    DO_MCP=0 ;;
    --no-doctor) DO_DOCTOR=0 ;;
    --force)     FORCE=1 ;;
    -*)          echo "⚠  unknown flag: $arg"; exit 2 ;;
    *)           TARGET="$arg" ;;
  esac
done
TARGET="${TARGET:-$PWD}"

if [[ "$(cd "$TARGET" 2>/dev/null && pwd)" == "$MASTER" ]]; then
  echo "⚠  Target is the master template itself — nothing to copy. Aborting."
  exit 1
fi

echo "▶ best-powers"
echo "  master : $MASTER"
echo "  target : $TARGET"
mkdir -p "$TARGET"

if [[ $FORCE -eq 0 && ( -f "$TARGET/CLAUDE.md" || -f "$TARGET/AGENTS.md" ) ]]; then
  echo "  • note: target already has CLAUDE.md/AGENTS.md — they will be overwritten (use --force to silence)."
fi

copy() { # src-relative
  local rel="$1"
  if [[ -e "$MASTER/$rel" ]]; then
    mkdir -p "$TARGET/$(dirname "$rel")"
    cp -R "$MASTER/$rel" "$TARGET/$(dirname "$rel")/"
    echo "  ✓ $rel"
  fi
}

echo "▶ Copying project config (single-source .ai layout)…"
copy ".AI.md"              # single master instruction (rules + standard + connectivity map)
copy ".mcp.json"           # claude-flow (ruflo v3) MCP server
copy ".gitignore"
copy ".rtk"                # RTK token-killer filter config
copy ".ai/agents"          # all custom agent definitions
copy ".ai/commands"        # all slash commands
copy ".ai/helpers"         # helper scripts
copy ".ai/hooks"           # sidecar-docs, frontend-lint, inject-chain, ruflo-check
copy ".ai/skills"          # full skill library (frontend, backend, swarm, github, sparc…)
copy ".ai/settings.json"
copy ".ai/codex-config.toml"
copy "docs/wiki"           # llm wiki scaffold

echo "▶ Wiring symlinks (.claude/.codex → .ai; CLAUDE/AGENTS/GEMINI → .AI.md)…"
( cd "$TARGET"
  [ -e .claude ] && [ ! -L .claude ] && rm -rf .claude
  [ -e .codex  ] && [ ! -L .codex  ] && rm -rf .codex
  ln -sfn .ai .claude
  ln -sfn .ai .codex
  for f in CLAUDE.md AGENTS.md GEMINI.md; do
    [ -e "$f" ] && [ ! -L "$f" ] && rm -f "$f"
    ln -sfn .AI.md "$f"
  done
)
echo "  ✓ symlinks in place"
echo "  • project template: $MASTER/.ai/templates/Template Project (copy per app into apps/<name>-web|-back)"

if [[ $DO_MCP -eq 1 ]]; then
  echo "▶ Registering claude-flow MCP server in target scope (idempotent)…"
  ( cd "$TARGET" && claude mcp add claude-flow -- npx -y ruflo@latest mcp start 2>/dev/null ) \
    && echo "  ✓ MCP added (scope: $TARGET)" || echo "  • MCP already present / skipped"
else
  echo "▶ Skipping MCP registration (--no-mcp); .mcp.json was still copied."
fi

if [[ $DO_MCP -eq 1 ]] && command -v claude >/dev/null 2>&1; then
  echo "▶ Ensuring superpowers plugin (user scope, global; idempotent)…"
  if claude plugin list 2>/dev/null | grep -q "superpowers@claude-plugins-official"; then
    echo "  • superpowers already installed"
  else
    claude plugin install superpowers@claude-plugins-official 2>/dev/null \
      && echo "  ✓ superpowers installed" || echo "  • superpowers install skipped (marketplace not configured?)"
  fi
fi

# Ruflo: if not installed globally (or broken), install it ONCE so agents/skills/MCP
# use the fast global binary instead of re-downloading via `npx @latest` every call.
echo "▶ Ensuring ruflo is installed globally…"
if command -v ruflo >/dev/null 2>&1 && ruflo --version >/dev/null 2>&1; then
  echo "  • ruflo OK: $(command -v ruflo) ($(ruflo --version 2>/dev/null | head -1))"
else
  echo "  • ruflo missing or broken — installing (npm i -g ruflo@latest)…"
  npm install -g ruflo@latest \
    && echo "  ✓ global install OK: $(command -v ruflo 2>/dev/null)" \
    || echo "  ⚠ global install failed (permissions?) — falling back to npx"
fi
RUFLO="$(command -v ruflo >/dev/null 2>&1 && echo ruflo || echo 'npx -y ruflo@latest')"

if [[ $DO_DOCTOR -eq 1 ]]; then
  echo "▶ Running ruflo doctor --fix…"
  ( cd "$TARGET" && $RUFLO doctor --fix ) || echo "  • doctor reported issues (non-fatal)"
else
  echo "▶ Skipping ruflo doctor (--no-doctor)."
fi

# Summary
SKILLS=$(ls "$TARGET/.claude/skills" 2>/dev/null | wc -l | tr -d ' ')
AGENTS=$(ls "$TARGET/.claude/agents" 2>/dev/null | wc -l | tr -d ' ')
CMDS=$(ls "$TARGET/.claude/commands" 2>/dev/null | wc -l | tr -d ' ')
LAW="$TARGET/.claude/skills/frontend-agent/references/react-senior-standard.md"
echo "▶ Summary"
echo "  • skills: $SKILLS  • agent groups: $AGENTS  • commands: $CMDS"
[[ -f "$LAW" ]] && echo "  • frontend standard: present ($(wc -l < "$LAW" | tr -d ' ') lines)" \
                || echo "  • frontend standard: MISSING ⚠"
echo "✅ best-powers initialized in: $TARGET"
echo "   Restart Claude Code in this folder so it picks up .AI.md, skills, agents and the MCP server."
