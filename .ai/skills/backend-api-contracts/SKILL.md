---
name: backend-api-contracts
description: Use when designing, implementing, documenting, or reviewing backend API contracts including REST resources, HTTP methods, status codes, OpenAPI, pagination, filtering, errors, webhooks, versioning, deprecation, and rate limits.
---

# Backend API Contracts

## Overview

Design APIs from the consumer inward. A backend API is a contract: stable names, explicit validation, predictable errors, and documented compatibility rules matter more than controller convenience.

## Workflow

1. Identify consumers and their access patterns before naming endpoints.
2. Model resources as nouns with stable IDs. Use actions only when the domain action is not CRUD.
3. Define request, response, validation, auth, idempotency, and error behavior before code.
4. Choose pagination and filtering based on data size and ordering stability.
5. Update or create OpenAPI/schema docs when public contract changes.
6. Add tests for success, validation errors, auth failures, not found, conflicts, pagination edges, and rate limits.

## Contract Rules

| Area | Rule |
| --- | --- |
| Naming | Use plural resources: `/v1/users/{userId}/orders`; avoid verbs such as `/getUser`. |
| Methods | `GET` reads, `POST` creates/actions, `PUT` replaces, `PATCH` partially updates, `DELETE` removes or schedules removal. |
| Status | Use `201` with `Location` for creation, `204` for empty success, `400` validation, `401` unauthenticated, `403` unauthorized, `404` missing, `409` conflicts, `422` semantic validation when used consistently, `429` rate limit. |
| Errors | Return a stable envelope with machine-readable code, human message, optional field details, and correlation/request ID. |
| Pagination | Prefer cursor pagination for changing ordered collections; offset is acceptable for small, stable admin lists. |
| Versioning | Version externally visible breaking changes. Deprecate with dates, docs, telemetry, and compatibility tests. |
| Webhooks | Sign payloads, include event IDs, retry policy, idempotency guidance, and schema version. |

## API Design Checklist

- Auth and authorization are explicit for every endpoint.
- Mutating endpoints define idempotency and conflict behavior.
- Filtering and sorting fields are allowlisted.
- Response models do not expose internal fields, secrets, or password hashes.
- List endpoints have bounded page sizes.
- Error examples exist for each class of failure.
- Rate limits define scope, headers, and client recovery behavior.
- Contract tests or OpenAPI validation run in CI when available.

## Common Mistakes

- Designing route paths around database table names instead of domain resources.
- Returning `200` for every outcome and hiding errors in payload fields.
- Adding pagination after lists are already slow or unbounded.
- Exposing ORM models directly as API responses.
- Breaking clients with silent field renames.
- Letting undocumented webhook retries create duplicate side effects.
