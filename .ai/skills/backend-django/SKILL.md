---
name: backend-django
description: Use when designing, implementing, debugging, or reviewing Django or Django REST Framework backend code including models, migrations, managers, QuerySets, serializers, ViewSets, services, permissions, admin, signals, Celery tasks, caching, ORM optimization, tests, or security-sensitive Django behavior.
---

# Backend Django

## Overview

Use Django's batteries intentionally. Keep models honest, queries efficient, views thin, permissions explicit, and business rules in services or domain modules when they outgrow serializers/views.

## Workflow

1. Model data and invariants with fields, constraints, indexes, managers, and migrations.
2. Keep DRF views/ViewSets thin: auth, permissions, serializer validation, service call, response.
3. Put business orchestration in `services/` or domain modules; keep serializers focused on validation/representation.
4. Optimize ORM access with `select_related`, `prefetch_related`, annotations, and pagination based on real query paths.
5. Enforce permissions at collection and object level.
6. Test with pytest-django or Django TestCase, including migrations, permissions, serializer validation, and query counts for hot paths.

## Django Rules

| Area | Rule |
| --- | --- |
| Models | Add constraints and indexes for real invariants and queries. Prefer explicit related names. |
| Migrations | Keep migrations reversible when possible; split risky data migrations from schema changes. |
| Serializers | Validate input and representation. Do not hide complex business workflows inside serializer methods. |
| Views | Keep views/ViewSets thin. Use services for orchestration and transactions. |
| Permissions | Default deny. Check object ownership, tenant, role, and business state. |
| ORM | Avoid N+1 with `select_related` and `prefetch_related`; inspect query counts for list endpoints. |
| Admin | Treat admin actions as privileged backend operations with validation and audit needs. |

## Implementation Checklist

- Model constraints match business invariants.
- QuerySets are scoped by tenant/user before filtering user-provided params.
- DRF serializers do not expose secrets, internal flags, or unauthorized related objects.
- Permissions are tested for anonymous, wrong user, wrong tenant, and insufficient role.
- Mutating workflows use transactions where invariants cross multiple writes.
- List endpoints are paginated and query-count aware.
- Celery/background tasks are idempotent or have compensation.

## Common Mistakes

- Relying on template/view checks while API serializers leak fields.
- Filtering after evaluation and accidentally loading too much data.
- Adding raw SQL before exhausting safe ORM/queryset options.
- Using signals for business workflows that need explicit transaction control.
- Forgetting object-level permissions on detail, update, and delete routes.
