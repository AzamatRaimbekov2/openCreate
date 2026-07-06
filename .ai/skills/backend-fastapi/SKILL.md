---
name: backend-fastapi
description: Use when designing, implementing, debugging, or reviewing FastAPI backend routes, async endpoints, Pydantic v2 schemas, SQLAlchemy or SQLModel models, Alembic migrations, dependency injection, middleware, JWT/OAuth auth, OpenAPI contracts, pytest coverage, or production Python API services.
---

# Backend FastAPI

## Overview

Build FastAPI services around typed boundaries: Pydantic for I/O, dependencies for request context, services for business rules, and repositories/data modules for persistence.

## Workflow

1. Define request and response schemas before route implementation.
2. Keep route functions thin: validate input, resolve dependencies, call service, return typed response.
3. Put business rules in services and database details in repositories/data access modules.
4. Use async consistently for async database drivers and outbound I/O; do not block the event loop.
5. Translate domain errors into safe `HTTPException` or a central exception handler.
6. Test routes with dependency overrides and services with direct unit tests.

## FastAPI Rules

| Area | Rule |
| --- | --- |
| Schemas | Use Pydantic v2 models for external input/output. Avoid raw dicts at API boundaries. |
| Dependencies | Use `Depends` for auth, DB sessions, settings, request context, and reusable guards. |
| Database | Use one session per request/task. Keep transactions short and explicit. |
| Auth | Verify issuer/audience/expiry/scopes for JWT/OAuth/OIDC. Default deny on object access. |
| OpenAPI | Keep route response models and documented error cases aligned with the contract. |
| Background work | Use background tasks only for lightweight work; use a queue for durable jobs. |
| Testing | Use pytest, TestClient or async client, dependency overrides, and migration-aware fixtures. |

## Implementation Checklist

- Route has typed request, typed response, auth dependency, and explicit status codes.
- Service can be tested without ASGI setup.
- Database session lifecycle is managed by a dependency.
- Async routes do not call blocking clients without a threadpool or replacement.
- Error responses are stable and do not leak internals.
- Alembic migrations cover model changes.
- Tests cover happy path, validation, auth, permissions, not found, conflicts, and DB failure edges.

## Common Mistakes

- Putting SQLAlchemy queries and business rules directly inside route functions.
- Mixing sync and async SQLAlchemy sessions in the same service path.
- Returning ORM models that expose internal fields.
- Treating OpenAPI generation as documentation while errors and auth are undocumented.
- Using FastAPI `BackgroundTasks` for work that must survive process restarts.
