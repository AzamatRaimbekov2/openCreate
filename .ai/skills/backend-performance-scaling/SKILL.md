---
name: backend-performance-scaling
description: Use when investigating or reviewing backend latency, throughput, p95/p99, hot paths, caching, queue throughput, backpressure, fan-out, payload size, connection pools, N+1 queries, load tests, benchmarks, or scaling strategy.
---

# Backend Performance And Scaling

## Overview

Performance work starts with evidence. Measure the bottleneck, protect correctness, then choose the smallest scaling or optimization move that addresses the measured limit.

## Workflow

1. Define the user-facing goal: latency percentile, throughput, cost, freshness, or capacity.
2. Capture baseline evidence: trace, profile, query plan, benchmark, load test, dashboard, or log sample.
3. Classify the bottleneck: CPU, memory, database, network, queue, lock, dependency, serialization, or client payload.
4. Apply one change at a time and rerun the same measurement.
5. Add regression tests, benchmarks, budgets, or monitoring for the changed hot path.

## Optimization Rules

| Symptom | First Checks |
| --- | --- |
| Slow endpoint | Trace spans, DB query count/time, outbound calls, payload size, serialization, auth middleware. |
| Hot database | N+1, missing/unused indexes, lock waits, pool exhaustion, unbounded lists, large transactions. |
| High p99 | Queueing, retries, cold starts, GC/memory pressure, noisy dependencies, connection churn. |
| Cache miss storm | TTL alignment, stampede protection, key cardinality, invalidation, warmup, stale-while-revalidate. |
| Queue lag | Consumer concurrency, job duration, retries, poison messages, visibility timeout, DLQ growth. |
| CPU saturation | Profiling, expensive parsing/serialization, compression, crypto, regex, synchronous loops. |

## Scaling Patterns

- Batch independent reads to avoid N+1 and fan-out storms.
- Cache only when key, TTL, invalidation, and consistency tradeoff are named.
- Use backpressure: bounded queues, rate limits, concurrency caps, and admission control.
- Prefer async jobs for slow work the caller does not need immediately.
- Scale reads with indexes, replicas, materialized views, or projections only after query plans support it.
- Scale writes by reducing transaction size, batching, partitioning, sharding, or changing workflow shape.

## Review Checklist

- Baseline and post-change measurements are comparable.
- The code does not optimize a cold path while the hot path remains unchanged.
- New cache cannot serve unauthorized or cross-tenant data.
- Queue workers are idempotent and can handle duplicate or delayed jobs.
- Connection/thread pool changes respect database and platform limits.
- Load tests avoid coordinated omission when measuring latency.

## Common Mistakes

- Optimizing by intuition without baseline evidence.
- Adding caching to hide bad authorization or data modeling.
- Increasing concurrency until the database fails harder.
- Reporting average latency when tail latency drives user pain.
- Shipping benchmarks that do not exercise realistic payloads or contention.
