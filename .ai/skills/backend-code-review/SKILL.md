---
name: backend-code-review
description: Use when reviewing backend code, pull requests, pending changes, API handlers, services, repositories, migrations, workers, auth flows, performance-sensitive paths, tests, or backend architecture for correctness, security, maintainability, and production risk.
---

# Backend Code Review

## Overview

Review backend changes for behavior and risk first. Lead with bugs, security issues, data-loss risks, performance regressions, and missing tests. Style is secondary.

## Review Workflow

1. Identify changed backend boundaries: API, service, data, auth, worker, migration, config, or observability.
2. Read tests and docs before implementation details when available.
3. Trace one happy path and the most dangerous failure path.
4. Check the relevant narrow backend skills for domain-specific rules.
5. Report findings first, ordered by severity, with file and line references.
6. Mention residual test gaps when no issue is found.

## Review Checklist

| Area | Questions |
| --- | --- |
| Correctness | Are invariants enforced? Are edge cases, nulls, retries, duplicate events, and race conditions handled? |
| API | Are status codes, validation, pagination, errors, idempotency, and compatibility correct? |
| Data | Are migrations safe? Are constraints, transactions, indexes, and query counts appropriate? |
| Security | Is authn/authz complete? Are secrets redacted? Are inputs allowlist-validated? Is tenant isolation tested? |
| Reliability | Are timeouts, retries, circuit breakers, health checks, and job failure paths explicit? |
| Performance | Is there N+1, unbounded list, fan-out, payload bloat, pool exhaustion, or cache misuse? |
| Tests | Do tests cover happy path, validation, auth failures, conflicts, not found, consistency, and regressions? |
| Maintainability | Are layers clear? Is domain logic separated from framework glue? Is config typed and validated? |

## Severity Guide

- P0: data loss, credential exposure, auth bypass, production outage, destructive migration.
- P1: serious correctness bug, tenant leak, unbounded resource use, missing transaction for critical invariant.
- P2: likely regression, missing important test, confusing API behavior, moderate performance risk.
- P3: maintainability, naming, documentation, small consistency issues.

## Output Shape

Use code-review posture:

```text
Findings
- [P1] file:line Short title
  Evidence and impact. Suggest the smallest safe fix.

Open Questions
- ...

Tests
- Ran ...
- Not run ...
```

## Common Mistakes

- Approving because tests pass while migration or auth behavior is unreviewed.
- Reviewing only controller code and skipping services, repositories, and jobs.
- Treating missing tests as low severity when the changed path is security or data-critical.
- Suggesting broad refactors instead of actionable risk fixes.
- Reporting performance concerns without explaining the measured or plausible hot path.
