---
name: backend-framework-patterns
description: Use when implementing or refactoring backend routes, controllers, services, middleware, validation, dependency injection, error handling, or project structure in FastAPI, Node.js, Express, Next.js API routes, or similar web backend frameworks.
---

# Backend Framework Patterns

## Overview

Keep framework code thin. Routes adapt HTTP to domain operations; services hold business rules; repositories or data access modules own persistence; middleware handles cross-cutting concerns.

## Universal Structure

| Layer | Responsibility |
| --- | --- |
| Route/controller | Parse request, call validation/dependencies, invoke service, map response. |
| Schema/DTO | Validate and document input/output. |
| Service/use case | Enforce business rules, transactions, orchestration, idempotency. |
| Repository/data access | Query persistence without HTTP knowledge. |
| Middleware/dependency | Auth, request IDs, rate limiting, sessions, DB session lifecycle. |
| Error handler | Convert known errors to safe API responses and log unexpected failures once. |

## FastAPI Rules

- Use Pydantic models for all request and response shapes.
- Use `Depends` for auth, database sessions, and shared context.
- Keep route functions short; move business logic into services.
- Use `response_model` or typed responses to prevent accidental field exposure.
- Prefer async dependencies and sessions consistently when the stack is async.
- Raise typed domain errors in services and translate them at the API boundary.

## Node And Express Rules

- Validate `req.body`, `req.params`, and `req.query` with a schema library such as Zod.
- Wrap async handlers so promise rejections reach the central error handler.
- Use security middleware and rate limits where appropriate, especially auth endpoints.
- Validate required environment/config at startup and fail fast.
- Keep controllers thin and services framework-agnostic.
- Do not pass raw user input into SQL, filesystem paths, shell commands, or outbound URLs.

## Next.js API And Route Handler Rules

- Separate server-only business logic from route handler files.
- Avoid leaking server secrets into client components or public env vars.
- Use `Request` parsing and schema validation before service calls.
- Set caching behavior intentionally for read endpoints.
- Return consistent `NextResponse` error envelopes.

## Implementation Checklist

- Route has validation, auth, and error mapping.
- Service has tests for business behavior without HTTP setup.
- Data access is injectable or mockable without changing production code.
- Config is typed and validated at startup.
- Logs include request correlation but not secrets.
- Framework-specific code does not spread into domain logic.

## Common Mistakes

- Putting business logic directly in route handlers.
- Returning ORM entities directly from controllers.
- Creating database sessions manually per helper instead of through lifecycle dependencies.
- Catching errors in every controller and logging duplicates.
- Mixing sync and async database clients in the same request path.
