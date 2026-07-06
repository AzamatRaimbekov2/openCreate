---
name: backend-engineering
description: Use when designing or changing backend systems, services, APIs, workers, data flows, scaling strategies, or cross-cutting backend architecture decisions involving reliability, security, performance, observability, or data consistency.
---

# Backend Engineering

## Overview

Use this as the backend architecture router. Start broad, identify the dominant risk, then delegate to the narrower backend skills only after the tradeoff is clear.

## Startup

1. Read project wiki and nearby feature docs before proposing architecture.
2. Identify the affected backend boundary: API contract, data model, auth, worker, external dependency, cache, or service split.
3. State the constraint that matters most: correctness, latency, throughput, isolation, cost, operability, security, delivery speed, or migration safety.
4. Use `agent-assets/backend/references/backend-quality-checklist.md` for a cross-cutting check.

## Decision Rules

- Keep the simplest deployable shape until evidence justifies extra boundaries.
- Treat APIs as contracts and databases as durable product state, not implementation details.
- Design failure behavior before the happy path for every network, queue, cache, and storage dependency.
- Instrument before optimizing. Require traces, logs, metrics, benchmarks, or query plans for performance claims.
- Default deny for authorization and default private for data exposure.
- Prefer idempotent operations and explicit transactions for state changes.
- Add queues, caches, replicas, or microservices only with a named problem and rollback plan.

## Backend Concern Router

| Concern | Use |
| --- | --- |
| API shape, HTTP semantics, OpenAPI, errors, pagination | `$backend-api-contracts` |
| Schema, migrations, indexes, pooling, transactions | `$backend-data-persistence` |
| Auth, authorization, secrets, validation, token/session lifecycle | `$backend-security-auth` |
| Logs, metrics, traces, SLOs, retries, idempotency, timeouts | `$backend-reliability-observability` |
| Latency, caching, queues, backpressure, capacity | `$backend-performance-scaling` |
| FastAPI, Express, Next.js route/service implementation | `$backend-framework-patterns` |
| Reviewing existing backend code or PRs | `$backend-code-review` |

## Architecture Checklist

- What invariant must always hold, even under retries or partial failure?
- What data is authoritative, cached, derived, or eventually consistent?
- What can be retried safely, and what needs an idempotency key?
- What is synchronous because the caller needs the result, and what can become a job?
- What happens when each dependency is slow, down, or returns malformed data?
- What is observable from one request ID or trace ID across the full path?
- What is the migration path from current state to target state?

## Common Mistakes

- Splitting services before module boundaries are stable.
- Adding caches before measuring the bottleneck and defining invalidation.
- Treating auth as middleware only while object-level authorization is missing.
- Designing schemas from entity diagrams without access patterns.
- Retrying mutating calls without idempotency.
- Adding background jobs with no dead-letter, re-run, or compensation plan.
