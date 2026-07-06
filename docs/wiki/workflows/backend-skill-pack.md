---
type: workflow
status: current
updated: 2026-06-03
sources:
  - ../../AGENTS.md
  - ../../agent-assets/backend/FEATURE.md
  - ../../agent-assets/backend/.codex-plugin/plugin.json
  - ../../agent-assets/backend/references/skillsmp-sources.md
  - ../../agent-assets/backend/references/backend-quality-checklist.md
  - ../../tools/verify-agent-assets.ps1
  - ../../tools/test-install-agent-assets.ps1
  - ../../tools/test-template-project.ps1
  - ../sources/skillsmp-backend-skills.md
tags:
  - project-docs
  - wiki/workflow
  - backend
  - skills
---

# Backend Skill Pack

## Purpose

The backend skill pack is a Codex-first local plugin at `agent-assets/backend/`. It converts the best backend patterns discovered through SkillsMP into project-owned skills that can travel with installed target projects and the checked-in template.

## Skills

- `backend-engineering`: architecture router for cross-cutting backend decisions.
- `backend-api-contracts`: REST/OpenAPI contracts, HTTP semantics, pagination, errors, versioning, webhooks, and rate limits.
- `backend-data-persistence`: schemas, migrations, indexes, query plans, transactions, pools, partitioning, replication, and consistency.
- `backend-security-auth`: authn/authz, sessions, JWT/OAuth/OIDC, API keys, secrets, validation, tenant isolation, and object-level permissions.
- `backend-reliability-observability`: logs, metrics, tracing, health checks, SLI/SLOs, alerts, retries, timeouts, circuit breakers, idempotency, and partial failures.
- `backend-performance-scaling`: latency, throughput, p95/p99, caching, queues, backpressure, fan-out, payload size, pools, N+1, load tests, and benchmarks.
- `backend-framework-patterns`: FastAPI, Node.js, Express, and Next.js API route/service/middleware patterns.
- `backend-code-review`: backend review posture and checklist for correctness, security, performance, maintainability, and tests.
- `backend-golang`: idiomatic Go services, REST/gRPC APIs, Gin/Echo/Fiber/Chi, GORM/sqlx/ent, context propagation, concurrency, tests, vet/lint, and pprof.
- `backend-fastapi`: FastAPI routes, async endpoints, Pydantic v2, SQLAlchemy/SQLModel, Alembic, dependencies, auth, OpenAPI, and pytest.
- `backend-django`: Django/DRF models, migrations, managers, QuerySets, serializers, ViewSets, services, permissions, admin, Celery, caching, ORM optimization, tests, and security-sensitive behavior.

## Usage

Use `backend-engineering` first when a task spans multiple backend concerns. Use a narrower skill when the user asks for a specific API, database, auth, reliability, performance, framework, or review task.

The existing `agent-assets/backend-patterns/` standalone skill remains available, especially for Node.js, Express, and Next.js examples. The new `agent-assets/backend/` plugin is broader and provides specialized routing.

## Bootstrap Behavior

`tools/install-agent-assets.ps1` copies the backend plugin into target projects and lists all eight skill paths in the managed `PROJECT-LOCAL-AGENT-ASSETS` block. `Template Project/` also includes the backend plugin and lists the paths in both `AGENTS.md` and `AgentMD.md`.

The eleven skills are also installed globally under `C:/Users/User/.codex/skills/` so Codex can discover them after restart.

## Verification

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\verify-agent-assets.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tools\test-install-agent-assets.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tools\test-template-project.ps1
```

Each backend skill should also pass:

```powershell
python C:\Users\User\.codex\skills\.system\skill-creator\scripts\quick_validate.py <skill-folder>
```

## Related Pages

- [[skillsmp-backend-skills]]
- [[agent-assets-consolidation]]
- [[frontend-project-bootstrap]]
- [[template-project]]
