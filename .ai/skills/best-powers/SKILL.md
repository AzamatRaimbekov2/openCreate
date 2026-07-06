---
name: best-powers
description: One-shot bootstrap that gives any folder the full Ruflo / Claude Code "best powers" — the single-source .ai layout (88 skills, agents, commands, hooks, helpers, settings), one .AI.md master instruction with CLAUDE.md/AGENTS.md/GEMINI.md symlinks, .claude/.codex symlinks to .ai, docs/wiki scaffold, .rtk filters; registers the claude-flow MCP server, ensures the superpowers plugin AND a working global ruflo install, then runs ruflo doctor. Works on any device — master auto-resolves to ~/ruflo-powers (cloned/pulled from GitHub). Use when the user wants to initialize, set up, or power-up a new/empty folder with the complete agent + swarm + skills + frontend configuration.
---

# best-powers

Bootstraps the current working folder with the **complete** Ruflo + Claude Code
setup in the clean **single-source `.ai` architecture**.

Master resolution (any device, in order):
1. `BEST_POWERS_MASTER` env var, if set;
2. the author workspace `/Users/raimbekov/Desktop/AI-TOOLS`, if present;
3. `~/ruflo-powers` — auto-cloned (and `git pull`ed on every run) from
   `https://github.com/AzamatRaimbekov/ruflo-powers`.

> New device? Install this skill + the `/best-powers` command with one line:
> `curl -fsSL https://raw.githubusercontent.com/AzamatRaimbekov/ruflo-powers/main/bootstrap.sh | bash`

## What it installs into the target folder

- `.ai/` — the **single source of truth** for Claude / Codex / Gemini:
  - `skills/` — the full **88-skill library**: frontend (`frontend-agent` router +
    `ui-ux-pro-max`, `react-19-*`, `nextjs-app-router-practices`, …), backend
    (12-skill `backend-*` suite), `graphify`, `find-skills`, `swarm-run`,
    swarm/sparc, github, agentdb, review, workflow skills, and the
    `project-kickoff` architecture-approval gate
  - `agents/` — all custom agent definitions, incl. the named team:
    `frontend-engineer`, `backend-engineer`, `architect`, `chain-planner`,
    `code-reviewer`, `debugger`, `docs-keeper`, `behaviour-judge`
  - `commands/`, `helpers/`, `hooks/` (sidecar-docs, frontend-lint, inject-chain,
    ruflo-check), `settings.json`, `codex-config.toml`
  - `templates/Template Project` — the app starter to copy into `apps/<name>-web`,
    `apps/<name>-back`, …
- `.AI.md` — the **single master instruction** (rules, binding frontend standard,
  connectivity map); `CLAUDE.md`, `AGENTS.md`, `GEMINI.md` are **symlinks** to it
- symlinks `.claude → .ai` and `.codex → .ai` — no duplicated config trees
- `docs/wiki/` — LLM wiki scaffold; `.mcp.json`; `.rtk/`; `.gitignore`
- Registers the `claude-flow` MCP server in the **target's** scope
- Ensures the official **`superpowers`** plugin (user scope, idempotent)
- Ensures **ruflo works globally**: if `ruflo` is missing or broken, installs it
  once via `npm i -g ruflo@latest` (npx fallback), then runs `ruflo doctor --fix`
  and prints a summary (skill/agent counts, frontend-standard check)

## How to run

`/best-powers` in Claude Code, or directly (defaults to `$PWD`):

```bash
bash ~/.claude/skills/best-powers/scripts/setup.sh
bash ~/.claude/skills/best-powers/scripts/setup.sh /path/to/folder
bash ~/.claude/skills/best-powers/scripts/setup.sh --no-doctor      # config only, fast
bash ~/.claude/skills/best-powers/scripts/setup.sh --no-mcp --force # no MCP add, silent overwrite
```

Flags: `--no-mcp` (skip MCP registration; `.mcp.json` still copied), `--no-doctor`
(skip the ruflo health check), `--force` (overwrite existing instruction files
without the warning note).

## After running

Tell the user to **restart Claude Code in that folder** so it loads `.AI.md`,
skills, agents, hooks and the MCP server. The script is idempotent and safe to
re-run; it refuses to run against the master template itself. Any new skill,
agent, or rule added to the master automatically ships to future folders —
`best-powers` is the propagation mechanism for the whole setup. New services
belong in `apps/<name>-web`, `apps/<name>-back`, … (start from
`.ai/templates/Template Project`).
