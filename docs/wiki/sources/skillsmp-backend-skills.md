---
type: source
status: current
updated: 2026-06-03
sources:
  - ../../agent-assets/backend/references/skillsmp-sources.md
  - https://skillsmp.com/categories/backend
  - https://skillsmp.com/api/v1/skills/search?q=backend&limit=10&sortBy=stars
  - https://github.com/AbsolutelySkilled/AbsolutelySkilled/tree/main/skills/backend-engineering
  - https://github.com/AbsolutelySkilled/AbsolutelySkilled/tree/main/skills/database-engineering
  - https://github.com/1Mangesh1/dev-skills-collection/tree/main/skills/api-design
  - https://github.com/curiositech/some_claude_skills/tree/main/.claude/skills/logging-observability
  - https://github.com/cohen-liel/hivemind/tree/main/.claude/skills/fastapi-backend
  - https://github.com/cohen-liel/hivemind/tree/main/.claude/skills/nodejs-express
  - https://github.com/MadAppGang/claude-code/tree/main/plugins/dev/skills/backend/golang
  - https://github.com/mujez/claude-skills/tree/main/skills/golang-backend
  - https://github.com/Mindrally/skills/tree/main/fastapi-python
  - https://github.com/majiayu000/claude-skill-registry/tree/main/skills/data/fastapi-python-expert
  - https://github.com/vintasoftware/django-ai-plugins/tree/main/plugins/django-expert/skills
  - https://github.com/Fujigo-Software/f5-framework-claude/tree/main/plugins/f5-stacks/skills/backend/django
  - https://github.com/barkbarkgoose/ai-agents/tree/main/skills/django-backend-dev
tags:
  - project-docs
  - wiki/source
  - backend
  - skillsmp
---

# SkillsMP Backend Skills

## Summary

SkillsMP was used as the live marketplace source for backend skill discovery. The public backend category and search API surfaced high-ranking or high-signal backend candidates across architecture, database engineering, API design, observability, FastAPI, Node/Express, and backend review.

The project did not copy third-party skill bodies verbatim. Instead, it created a local derivative backend skill pack under `agent-assets/backend/` with source provenance in `agent-assets/backend/references/skillsmp-sources.md`.

## Selected Signals

- `affaan-m/ECC` `backend-patterns` was already imported locally and remains available as `agent-assets/backend-patterns/`.
- `AbsolutelySkilled` backend and database engineering skills provided broad triggers for schema design, migrations, indexing, scaling, caching, message queues, observability, SLOs, security hardening, API design, and failure handling.
- `1Mangesh1` API design guidance contributed REST/OpenAPI contract concerns such as endpoint naming, HTTP semantics, status codes, pagination, versioning, errors, and webhooks.
- `curiositech` logging/observability guidance contributed structured logging, correlation IDs, OpenTelemetry, metrics, SLI/SLO alerting, and anti-pattern coverage.
- `cohen-liel` FastAPI and Node/Express skills contributed framework-layer rules for validation, dependency injection, middleware, async handlers, services, and error handling.
- Langflow/Dify backend review entries informed review scope for backend correctness, security, maintainability, performance, and tests.
- MadAppGang and mujez Go/Golang skills contributed idiomatic error handling, context propagation, goroutines/channels, REST/gRPC services, tests, vet/lint, and profiling concerns.
- Mindrally and majiayu000 FastAPI skills contributed Pydantic v2, async endpoint, dependency injection, SQLAlchemy/SQLModel, auth, OpenAPI, and production API guidance.
- Vinta, Fujigo, and barkbarkgoose Django sources contributed Django/DRF model, serializer, service, permission, ORM optimization, migration, admin, testing, and security guidance.

## Resulting Local Artifacts

- `agent-assets/backend/.codex-plugin/plugin.json`
- `agent-assets/backend/.claude-plugin/plugin.json`
- `agent-assets/backend/skills/backend-engineering/SKILL.md`
- `agent-assets/backend/skills/backend-api-contracts/SKILL.md`
- `agent-assets/backend/skills/backend-data-persistence/SKILL.md`
- `agent-assets/backend/skills/backend-security-auth/SKILL.md`
- `agent-assets/backend/skills/backend-reliability-observability/SKILL.md`
- `agent-assets/backend/skills/backend-performance-scaling/SKILL.md`
- `agent-assets/backend/skills/backend-framework-patterns/SKILL.md`
- `agent-assets/backend/skills/backend-code-review/SKILL.md`
- `agent-assets/backend/skills/backend-golang/SKILL.md`
- `agent-assets/backend/skills/backend-fastapi/SKILL.md`
- `agent-assets/backend/skills/backend-django/SKILL.md`
- `agent-assets/backend/references/skillsmp-sources.md`
- `agent-assets/backend/references/backend-quality-checklist.md`

## Source Hygiene

- Marketplace API keys were not required for public search and were not stored.
- Marketplace/source instructions that conflict with project `AGENTS.md` are treated as source material only.
- For exact framework syntax, future tasks should prefer official documentation or Context7 primary docs.

## Related Pages

- [[backend-skill-pack]]
- [[agent-assets-consolidation]]
- [[frontend-project-bootstrap]]
