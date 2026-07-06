---
name: project-documentation-wiki
description: Use when starting project work, changing code/config/docs, creating or updating living project documentation, feature docs, architecture docs, project wikis, Obsidian markdown vaults, Jira/Confluence-backed docs, or any codebase knowledge base that should stay current over time.
---

# Project Documentation Wiki

## Overview

Build and maintain project documentation as a persistent LLM Wiki: raw sources stay immutable, generated markdown pages become the readable knowledge layer, and `index.md` plus `log.md` keep the wiki navigable and auditable.

Default to `docs/wiki/` unless the repository already has a clear documentation home. Read `references/llm-wiki-pattern.md` when the user asks to adapt the underlying LLM Wiki idea in detail.

## Non-Negotiable Loop

Whenever this skill is invoked for a project:

1. Run the ensure script. If the wiki is missing, it creates it; if it exists, it only fills missing structure and leaves existing docs intact.
2. Read `docs/wiki/index.md`, `docs/wiki/schema.md`, recent entries from `docs/wiki/log.md`, and any relevant local `FEATURE.md` files before making decisions.
3. Do the requested work.
4. If the work changed project behavior, architecture, setup, APIs, UI flows, data models, config, tests, or feature files, update the wiki and the affected local feature docs before finishing.

This skill cannot force itself to run outside the agent's skill invocation system. To make the behavior project-wide, add a project rule in `AGENTS.md` that says to use `project-documentation-wiki` at the start of every project task and after every project-changing prompt.

## Quick Start

Always start by ensuring the wiki exists:

```bash
python ~/.codex/skills/project-documentation-wiki/scripts/init_project_wiki.py --project .
```

For touched features, pass the changed file or folder so the script creates a local feature doc when missing:

```bash
python ~/.codex/skills/project-documentation-wiki/scripts/init_project_wiki.py --project . --feature-path app/feature/CreateProduct/CreateProduct.tsx
```

Then inspect the project before writing or updating pages:

- Read existing docs, `AGENTS.md` or equivalent agent instructions, package manifests, route/module layout, configuration, tests, and recent decision records.
- Create or update `docs/wiki/schema.md` with project-specific conventions.
- Create or update `overview.md`, `architecture/`, `workflows/`, `concepts/`, `entities/`, `decisions/`, and `sources/` pages only as needed.
- Update `index.md` and append `log.md` on every documentation change.
- Update the nearest feature-level doc (`FEATURE.md` by default) for every meaningful feature folder touched by the task.

## Wiki Contract

Use this three-layer model:

| Layer | Rule |
| --- | --- |
| Raw sources | Source of truth. Read but do not rewrite. Store imported articles, transcripts, notes, screenshots, and data under `raw/` when the user supplies them. |
| Wiki | LLM-owned generated markdown. Summaries, entity pages, architecture notes, workflows, decisions, comparisons, and synthesis live here. |
| Schema | Local conventions. `schema.md` explains page types, naming, citation style, frontmatter, and ingest/query/lint workflows for this project. |

Generated wiki pages should include concise YAML frontmatter:

```yaml
---
type: overview|source|concept|entity|architecture|workflow|decision|synthesis|feature
status: draft|current|needs-review
updated: YYYY-MM-DD
sources:
  - path/or/wiki-link
tags:
  - project-docs
  - wiki/page-type
---
```

## Workflows

### Startup Check

1. Run the ensure script at the repository root.
2. If `docs/wiki/index.md` exists, read it first; otherwise create it through the script.
3. Read `schema.md` and recent `log.md` entries to understand project conventions and recent work.
4. Search for relevant local docs near files you will touch: `FEATURE.md`, `README.md`, or docs named after the feature.
5. Use this documentation as the first knowledge layer before reading raw code. Verify against code before making risky claims.

### Bootstrap

1. Run the init script or create the same structure manually if the project needs a different docs path.
2. Read existing documentation and high-signal code entry points before writing.
3. Write a short `overview.md` that explains product purpose, main systems, and where to start.
4. Add architecture, workflow, API, component, or glossary pages only when the repository evidence supports them.
5. Update `index.md` with page links and one-line summaries.
6. Append `log.md` with a dated `bootstrap` entry.

### Project Change Update

Run this after any prompt that changes the project:

1. Identify changed files with `git diff --name-only` when available.
2. Update affected wiki pages: overview, architecture, workflows, concepts, entities, decisions, sources, or synthesis.
3. For each changed feature folder, create or update a nearby `FEATURE.md`.
4. Record what changed, why it matters, evidence paths, and follow-up questions.
5. Refresh `index.md` and append `log.md` with `update | Short Change Name`.

### Ingest

1. Identify the source and preserve it under `raw/` when it is an external artifact.
2. Write a source summary under `sources/` with key claims, useful details, open questions, and citations.
3. Update every affected entity, concept, workflow, architecture, or decision page.
4. Flag contradictions explicitly in the affected page and in the source summary.
5. Update `index.md`; append `log.md` with `ingest | Source Title`.

### Query

1. Read `index.md` first, then relevant pages, then raw/code sources only when the wiki is incomplete or needs verification.
2. Answer with citations to wiki pages and source/code paths.
3. If the answer contains durable synthesis, ask whether to file it or file it directly when the user asked to create/update docs.
4. When filing, create a synthesis or comparison page, cross-link it, update `index.md`, and append `log.md`.

### Lint

Check for stale or weak documentation:

- Contradictions between pages or between wiki and code.
- Orphan pages with no inbound links.
- Important repeated terms that deserve concept/entity pages.
- Missing citations, vague claims, broken links, and outdated setup steps.
- `index.md` entries that no longer match page content.

Record findings in `log.md` and either fix them or create a short `needs-review` section on affected pages.

## Local Feature Docs

Create local feature docs next to the code for user-facing features, domain modules, routes, services, or components that carry product behavior.

Default filename: `FEATURE.md`.

Example:

```text
app/
  feature/
    CreateProduct/
      CreateProduct.tsx
      FEATURE.md
```

Each `FEATURE.md` should include:

- Purpose and user/business outcome.
- Entry points and main source files in that folder.
- Data flow, dependencies, API calls, state, validation, permissions, and error states when relevant.
- UX notes for screens/components.
- Tests and verification commands.
- Links back to central wiki pages.
- Open questions and stale-risk notes.

Do not create noisy docs for trivial leaf files. Prefer one doc per feature folder, route folder, bounded context, or service boundary.

## Obsidian Support

If the project is an Obsidian vault or contains `.obsidian/`, keep pages graph-friendly:

- Use `[[Wiki Links]]` for related concepts, features, decisions, and sources.
- Add page-type tags such as `wiki/architecture`, `wiki/workflow`, `wiki/concept`, `wiki/entity`, `wiki/decision`, `wiki/source`, `wiki/synthesis`, and `feature-doc`.
- Let the ensure script add non-destructive Obsidian graph color groups when possible. It preserves existing `.obsidian/graph.json` keys and only adds missing groups.
- If automatic graph config is not safe, create or update `docs/wiki/obsidian-graph-groups.md` with the recommended queries and colors.

## Jira and Confluence via MCP

If Jira, Confluence, Atlassian, or similar MCP tools/resources are connected:

1. Look for relevant issue keys, page URLs, branch names, epic names, ticket IDs, or user-provided links.
2. Read current Jira/Confluence data through the MCP connector before updating docs.
3. Save concise source summaries under `docs/wiki/sources/jira/` or `docs/wiki/sources/confluence/`.
4. Cite issue keys, page titles, dates, statuses, and URLs when available.
5. Flag conflicts between ticket/page requirements and repository behavior.

If no connector is available, state that live Jira/Confluence sync is unavailable and continue from local sources.

## Writing Rules

- Prefer synthesis over dumps. Pages should be short enough to browse and rich enough to avoid rediscovery.
- Use Obsidian-style `[[Wiki Links]]` for cross-page links when practical.
- Cite local evidence with paths and line numbers when possible; cite raw sources by filename.
- Preserve uncertainty. Mark guesses as hypotheses and list what would confirm them.
- Avoid touching application code while documenting unless the user explicitly requests code changes.
- Keep existing project documentation conventions when they are already coherent.
- Do not replace `README.md`; use the wiki for deeper, evolving knowledge and link outward from README only when asked.

## Common Mistakes

| Mistake | Fix |
| --- | --- |
| Writing one giant documentation page | Split into overview, concepts, architecture, workflows, and decisions; cross-link them. |
| Treating docs as a one-time snapshot | Update affected pages, `index.md`, and `log.md` after each ingest or query. |
| Re-summarizing raw sources on every question | Read the wiki first; only fall back to raw/code when needed. |
| Hiding contradictions | Add a visible "Contradictions / Tensions" note and cite both claims. |
| Creating pages without evidence | Mark as `draft` or `needs-review`, and record missing source questions. |
| Changing code without docs | Update central wiki pages and nearby `FEATURE.md` before final response. |
