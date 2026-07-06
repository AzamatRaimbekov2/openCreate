---
type: source
status: current
updated: 2026-05-28
sources:
  - C:/Users/User/.codex/skills/project-documentation-wiki/SKILL.md
  - C:/Users/User/.codex/skills/project-documentation-wiki/scripts/init_project_wiki.py
  - AGENTS.md
tags:
  - project-docs
  - wiki/source
---

# Project Documentation Wiki Skill

## Summary

The `project-documentation-wiki` skill maintains project documentation as a persistent LLM Wiki. It now requires agents to ensure `docs/wiki/` exists, read wiki memory at task startup, update central docs after project-changing prompts, and create local `FEATURE.md` docs beside meaningful feature folders.

## Important Behavior

- If the wiki is missing, the helper script creates `docs/wiki/` with `overview.md`, `schema.md`, `index.md`, `log.md`, and standard category folders.
- If the wiki exists, the script fills missing structure without overwriting existing pages.
- `--feature-path` creates a nearby `FEATURE.md` for folders such as `app/feature/CreateProduct/CreateProduct.tsx`.
- Obsidian support adds page-type tags and non-destructive graph color groups when `.obsidian/` exists.
- Jira and Confluence MCP connectors, when available, should be treated as live raw sources and summarized under `sources/jira/` or `sources/confluence/`.

## Skill Mirrors

- Codex active copy: `C:/Users/User/.codex/skills/project-documentation-wiki`
- Claude mirror: `C:/Users/User/.claude/skills/project-documentation-wiki`
- Agents mirror: `C:/Users/User/.agents/skills/project-documentation-wiki`

