# LLM Wiki Pattern

Use this reference when adapting the LLM Wiki idea for a project or explaining the documentation model.

## Core Idea

RAG answers rediscover knowledge from raw documents at query time. An LLM Wiki instead compiles knowledge once into a persistent, interlinked markdown wiki and keeps that wiki current as new sources and questions arrive. The wiki becomes a compounding artifact: cross-references, contradictions, summaries, and syntheses are preserved rather than lost in chat history.

The human curates sources, asks questions, and guides emphasis. The LLM reads, summarizes, files, cross-links, updates, and audits.

## Architecture

| Layer | Purpose | Ownership |
| --- | --- | --- |
| Raw sources | Immutable source collection: articles, papers, code references, meeting notes, transcripts, images, data files. | Human/curated source of truth. |
| Wiki | Generated markdown pages: overview, summaries, entity pages, concept pages, comparisons, architecture, synthesis. | LLM writes and maintains. |
| Schema | Project rules for page types, conventions, workflows, and citation style. | Human and LLM co-evolve. |

## Operations

### Ingest

Process one or more new sources. Read the source, discuss or infer key takeaways, create a source summary, update affected entity/concept/topic pages, flag contradictions, refresh the index, and append a log entry.

### Query

Answer from the wiki first. Read `index.md`, then relevant pages, then raw/code sources if verification is needed. Durable answers can become new wiki pages, especially comparisons, analyses, diagrams, and decisions.

### Lint

Periodically health-check the wiki for contradictions, stale claims, orphan pages, missing pages, weak citations, missing cross-references, broken links, and data gaps worth investigating.

## Special Files

`index.md` is content-oriented. It catalogs pages by category with links, summaries, and useful metadata. Read it first before queries.

`log.md` is chronological and append-only. Use consistent headings such as:

```markdown
## [2026-05-28] ingest | Source Title
```

This makes the wiki timeline easy to skim and parse.

## Optional Tooling

Small local tools can help once the wiki grows:

- Markdown search over wiki files.
- Link/orphan lint scripts.
- qmd or another local markdown search engine.
- Obsidian graph view, Dataview, Web Clipper, and Marp when useful.

Do not add infrastructure before the wiki needs it. At moderate scale, `index.md` plus `rg` is usually enough.

## Runtime Behavior for Project Agents

For project work, the wiki should be consulted as a startup memory layer. On each project task, ensure the wiki exists, read `index.md`, `schema.md`, recent `log.md`, and any local feature docs around touched files. If the task changes project behavior or code, update the wiki before finishing.

This works best when the project `AGENTS.md`, `CLAUDE.md`, or equivalent agent rule explicitly says to invoke the documentation wiki skill at startup and after project-changing prompts.

## Project Documentation Adaptation

For software projects, treat the repository itself as a major raw source. Ingest high-signal files first: README, agent instructions, package manifests, route tables, config, tests, public APIs, schema/migrations, and existing docs. Prefer pages that help future agents and humans navigate the project:

- `overview.md`: purpose, users, main capabilities, current status.
- `architecture/`: system shape, module boundaries, data flow, integration points.
- `workflows/`: setup, development, release, testing, debugging, operations.
- `concepts/`: domain terms and mental models.
- `entities/`: products, services, APIs, data models, teams, external systems.
- `decisions/`: durable tradeoffs with dates, context, and consequences.
- `sources/`: summaries of raw artifacts and code-reading passes.

Also create local docs at feature boundaries. For example, `app/feature/CreateProduct/CreateProduct.tsx` should normally have `app/feature/CreateProduct/FEATURE.md` when the feature is meaningful. The local doc explains the feature in detail and links back to central wiki pages.

## Obsidian Color Groups

Use tags and graph groups so Obsidian can color nodes by type:

| Page type | Tag | Suggested color |
| --- | --- | --- |
| Architecture | `wiki/architecture` | Blue |
| Workflow | `wiki/workflow` | Green |
| Concept | `wiki/concept` | Amber |
| Entity | `wiki/entity` | Purple |
| Decision | `wiki/decision` | Red |
| Source | `wiki/source` | Gray |
| Synthesis | `wiki/synthesis` | Teal |
| Feature docs | `feature-doc` | Orange |

If `.obsidian/graph.json` exists, update `colorGroups` without overwriting other settings. If it is absent or unsafe to edit, create `docs/wiki/obsidian-graph-groups.md` with the queries and colors for manual import.

## Jira and Confluence Sources

When Jira or Confluence MCP connectors exist, treat issues and pages as live raw sources. Store concise summaries under `sources/jira/` and `sources/confluence/`, update affected concepts/features/decisions, and cite ticket keys, page titles, statuses, URLs, and retrieval dates. Never invent connector data; if unavailable, say so and rely on repository evidence.
