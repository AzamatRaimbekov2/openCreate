---
name: backend-golang
description: Use when designing, implementing, debugging, or reviewing Go/Golang backend services, REST or gRPC APIs, Gin/Echo/Fiber/Chi handlers, GORM/sqlx/ent data access, goroutines, channels, context propagation, workers, CLIs, tests, vet, golangci-lint, or pprof profiling.
---

# Backend Golang

## Overview

Write idiomatic Go, not translated patterns from another language. Keep dependencies explicit, errors visible, context propagated, and concurrency bounded.

## Workflow

1. Identify the shape: HTTP API, gRPC service, worker, CLI, library, or migration/tooling task.
2. Keep handlers thin: parse/validate request, call service, map response/error.
3. Pass `context.Context` through request, database, queue, and outbound calls.
4. Make errors explicit with wrapping and typed sentinel/domain errors where useful.
5. Test behavior with table-driven tests, `httptest`, integration tests for persistence, and race checks for concurrency.
6. Run `go test ./...`, then `go vet ./...` and project lint when available.

## Go Backend Rules

| Area | Rule |
| --- | --- |
| Packages | Use small packages with clear ownership. Avoid generic `utils` as a dumping ground. |
| Errors | Return errors, wrap with context, and translate to API errors at the boundary. Do not log and return the same error repeatedly. |
| Context | Accept context as the first parameter on request-scoped operations. Do not store context in structs. |
| Concurrency | Bound goroutines with worker pools, semaphores, or cancellation. Avoid unowned background goroutines. |
| HTTP | Prefer explicit middleware for auth, request IDs, logging, rate limits, and timeouts. |
| Data | Keep SQL/GORM/sqlx/ent access outside handlers. Use transactions for invariants. |
| Config | Validate environment/config on startup and fail fast. |

## Implementation Checklist

- Handler/service/repository boundaries are clear.
- Every outbound call, DB operation, and goroutine path can be cancelled.
- No shared mutable state is accessed without synchronization.
- API responses hide internal errors and secrets.
- Tests include table-driven cases for success, validation, auth, not-found, conflict, and edge behavior.
- `go test -race` is considered for concurrency-sensitive code.
- Benchmarks or pprof evidence exist before performance claims.

## Common Mistakes

- Starting goroutines without cancellation or error collection.
- Ignoring returned errors or replacing them with vague messages.
- Passing request structs deep into domain logic instead of typed DTOs.
- Using global clients/config that make tests and multi-tenant behavior brittle.
- Optimizing with channels when a simple loop or mutex is clearer.
