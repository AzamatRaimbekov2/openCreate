---
name: backend-data-persistence
description: Use when designing database schemas, writing migrations, choosing indexes, optimizing queries, reading EXPLAIN plans, handling transactions, connection pools, soft deletes, audit trails, partitioning, replication, or backend data consistency.
---

# Backend Data Persistence

## Overview

Design persistence from invariants and access patterns. Data choices are expensive to undo, so prefer boring schemas, safe migrations, measured indexes, and explicit consistency boundaries.

## Workflow

1. List the writes, reads, uniqueness constraints, lifecycle states, and retention needs.
2. Choose normalized tables by default; denormalize only for measured read pressure or immutable projections.
3. Define indexes from real predicates, joins, ordering, and cardinality.
4. Plan migrations as expand, backfill, dual-read/write if needed, contract, then cleanup.
5. Use transactions for invariants that must change together.
6. Verify with tests and query evidence: constraints, migration rehearsal, EXPLAIN, or benchmark.

## Schema Rules

- Use explicit primary keys, foreign keys, unique constraints, and check constraints where the database can enforce truth.
- Store timestamps consistently and decide timezone behavior once.
- Avoid nullable fields unless the unknown or absent state is meaningful.
- Model status transitions explicitly when business workflow matters.
- Keep audit fields and soft-delete semantics consistent across tables.
- Avoid JSON columns for core queryable state unless schema evolution outweighs query/index needs.

## Migration Rules

| Change | Safe Pattern |
| --- | --- |
| Add column | Add nullable or default-safe column, deploy writers, backfill, then enforce not-null if needed. |
| Rename column | Add new column, dual write, backfill, switch reads, remove old column later. |
| Drop column/table | Prove no reads/writes remain through code search, telemetry, and staged deploy. |
| Add index | Use concurrent/online index creation when production traffic exists. |
| Change enum/status | Add new value first, deploy compatibility, migrate data, then remove old handling. |

## Query And Index Checklist

- Query selects only needed columns.
- N+1 reads are batched or preloaded intentionally.
- Composite index order matches equality, range, and sort usage.
- Index count is justified; write-heavy tables are not over-indexed.
- EXPLAIN confirms row estimates, join strategy, and index use.
- Connection pool size matches worker concurrency and database limits.
- Long transactions do not hold locks while calling external services.

## Common Mistakes

- Creating indexes without checking actual query plans.
- Running destructive migrations in the same deploy that changes reads.
- Using application validation instead of database constraints for critical invariants.
- Treating read replicas as strongly consistent.
- Opening sessions manually in request handlers instead of using framework dependency patterns.
