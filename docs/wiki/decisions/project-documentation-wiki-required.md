---
type: decision
status: current
updated: 2026-05-28
sources:
  - AGENTS.md
  - docs/wiki/sources/project-documentation-wiki-skill.md
tags:
  - project-docs
  - wiki/decision
---

# Require Documentation Wiki Checks

## Decision

Project tasks in this workspace must use `project-documentation-wiki` at startup, read the wiki before planning or editing, and update documentation after project-changing prompts.

## Rationale

The project contains reusable agent skills and governance rules. Keeping a persistent wiki prevents agents from rediscovering project conventions from scratch and makes skill changes, frontend governance, and plugin structure easier to maintain over time.

## Consequences

- `docs/wiki/` is now the project memory layer for durable documentation.
- `AGENTS.md` enforces the wiki startup and update workflow for this workspace.
- Feature-level docs should live near meaningful feature folders as `FEATURE.md`.
- Live Jira/Confluence data should be ingested through MCP connectors when connected and relevant.
