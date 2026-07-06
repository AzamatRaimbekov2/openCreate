---
name: backend-reliability-observability
description: Use when adding or reviewing backend logging, metrics, tracing, health checks, SLI/SLOs, alerts, runbooks, retries, timeouts, circuit breakers, idempotency, graceful degradation, queues, or partial-failure handling.
---

# Backend Reliability And Observability

## Overview

A backend is not production-ready until failures are bounded and observable. Design how the service behaves when dependencies are slow, broken, duplicated, or partially successful.

## Workflow

1. Map the request or job path across processes, dependencies, queues, caches, and storage.
2. Add correlation: request ID or trace ID in logs, metrics exemplars when available, and outbound calls.
3. Define SLIs before alerts: latency, error rate, saturation, freshness, queue age, or job success.
4. Add explicit timeouts, bounded retries with jitter, idempotency, and fallback behavior.
5. Separate liveness, readiness, and degraded dependency checks.
6. Verify with tests, local failure injection, or documented operational checks.

## Observability Rules

| Signal | Rule |
| --- | --- |
| Logs | Structured key-value logs with level, event name, request/trace ID, actor when safe, and error class. |
| Metrics | Bounded-cardinality counters, histograms, and gauges tied to SLIs. Avoid user IDs, raw URLs, or unbounded labels. |
| Traces | Span service boundaries and key internal operations; propagate context through queues when possible. |
| Alerts | Page on user impact or error budget burn, not isolated noisy symptoms. |
| Runbooks | Link alerts to dashboards, likely causes, mitigation, and rollback steps. |

## Failure Handling Rules

- Every outbound network call has a timeout.
- Retries are bounded, use jitter, and only retry transient failures.
- Mutating retries require idempotency keys or a dedupe strategy.
- Circuit breakers stop repeatedly calling a failing dependency.
- Queues define retry count, dead-letter policy, visibility timeout, and poison-message handling.
- Graceful degradation is explicit: stale cache, partial response, async processing, or fail closed.

## Checklist

- Can one request be followed across logs and traces?
- Do metrics distinguish client errors, server errors, dependency failures, and validation failures?
- Are health checks cheap and safe under high frequency?
- Are logs free of secrets and PII?
- Is there an alert for the real user-facing failure mode?
- Do retries make overload worse under dependency failure?
- Can duplicate jobs or webhook deliveries be processed safely?

## Common Mistakes

- Logging strings that cannot be queried by field.
- Measuring averages while p95/p99 latency is the real issue.
- Retrying all errors, including validation, auth, and permanent conflicts.
- Creating high-cardinality metrics from IDs, emails, paths, or query strings.
- Treating a shallow `/health` endpoint as readiness for all dependencies.
