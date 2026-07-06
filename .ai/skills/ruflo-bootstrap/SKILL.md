---
name: ruflo-bootstrap
description: Initialize and activate the Ruflo multi-agent runtime in this project. Use on a freshly copied template, when ruflo agents/swarm/memory are not working, when ".claude-flow/" is missing, or when the user asks to start/init/activate ruflo, the swarm, the daemon, or agent coordination.
---

# Ruflo Bootstrap

## Purpose

Make the Ruflo multi-agent system actually work after the template folder is copied. The static assets (89 agents, 166 commands, ruflo skills, helpers, `.mcp.json`, Codex `.agents/`) travel with the folder. The **runtime** does not — it must be built per machine/path:

- `.claude-flow/` runtime config, data, logs, sessions
- `.claude/memory.db` (AgentDB — stores absolute paths, so never copy it)
- an active **swarm** (coordination topology + message bus)
- the background **daemon**

This skill builds all of that.

> **Auto-triggered:** the `SessionStart` hook (`.claude/hooks/ruflo-check.sh`) runs this skill's script in the background automatically when the runtime is missing. You normally don't invoke it by hand — only if auto-bootstrap was disabled (`RUFLO_NO_AUTOBOOTSTRAP=1`) or reported a failure in `.claude-flow-bootstrap.log`.

## When to use

- First open of a freshly copied template.
- `swarm status` shows `No active swarm`, or `.claude-flow/` is missing.
- The user says: init/activate/start ruflo, swarm, daemon, agent coordination, or "make the agents work".

## How to run

Run the bundled script from the project root:

```bash
bash .claude/skills/ruflo-bootstrap/assets/init-ruflo.sh
```

It is **idempotent** — safe to run repeatedly. It will:
1. `npx ruflo@latest memory init` — build the local AgentDB (skipped if a memory DB already exists). The DB lands in `.swarm/memory.db` (or `.claude/memory.db`).
2. `npx ruflo@latest swarm init --topology hierarchical-mesh --max-agents 15` if no swarm is active.
3. `npx ruflo@latest daemon start` — start background workers.

It does **not** run `ruflo init` — on a copied template that refuses ("already initialized", because `.claude/settings.json` ships with the folder), and the runtime works without `.claude-flow/config.yaml`. The static `.claude/` config travels with the copy.

Requires Node 18+ and network access (downloads `ruflo@latest` via npx on first use).

## After bootstrap

- **Reopen Claude Code in this folder** so `.claude/settings.json` hooks, `CLAUDE.md`, and `.mcp.json` load (a running session does not pick up newly added hooks/MCP).
- **Approve the `claude-flow` MCP server** when Claude Code prompts (`autoStart` is off by design).
- For Codex, the `AGENTS.md` + `.agents/` assets are already in place; add MCP with `codex mcp add` after installing the Codex CLI.

## Verify

```bash
npx ruflo@latest init check        # should report initialized
npx ruflo@latest swarm status      # should show an active swarm (no "No active swarm")
```

## Stop / reset

```bash
npx ruflo@latest daemon stop
```
Runtime state lives in `.claude-flow/` and `.claude/memory.db` (both gitignored). Delete them and re-run this skill for a clean rebuild.
