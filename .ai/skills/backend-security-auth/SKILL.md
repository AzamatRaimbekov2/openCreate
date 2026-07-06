---
name: backend-security-auth
description: Use when implementing, reviewing, or hardening backend authentication, authorization, sessions, JWT/OAuth/OIDC flows, API keys, secrets, input validation, secure headers, tenant isolation, object-level permissions, or security-sensitive API behavior.
---

# Backend Security And Auth

## Overview

Build security into the backend boundary from the first design pass. Authentication proves identity; authorization proves this identity can perform this action on this object now.

## Workflow

1. Identify actors, credentials, trust boundaries, protected resources, and tenant boundaries.
2. Choose established auth protocols and libraries. Do not design custom crypto or password storage.
3. Enforce authentication at the boundary and authorization at the object/action level.
4. Validate all external input with allowlists and typed schemas.
5. Keep secrets out of source, logs, errors, metrics, traces, and generated docs.
6. Test bypass attempts, expired tokens/sessions, missing scopes, cross-tenant access, replay, and validation failures.

## Auth Rules

| Area | Rule |
| --- | --- |
| Passwords | Hash with a current password hashing library such as Argon2id or bcrypt with project-approved parameters. Never store plaintext or reversible passwords. |
| Sessions | Use secure, httpOnly, sameSite cookies for browser sessions unless token-based auth is required by the architecture. |
| JWT | Verify signature, issuer, audience, expiry, not-before, algorithm allowlist, and key rotation path. |
| OAuth/OIDC | Validate state/nonce, redirect URIs, token audience, scopes, and provider errors. |
| API keys | Store hashed keys, show once, scope narrowly, rotate, revoke, and audit usage. |
| Authorization | Default deny. Check object ownership, tenant, role/scope, and business-state constraints. |
| Secrets | Use environment or secret manager injection; validate required config at startup. |

## Security Checklist

- Every endpoint declares auth requirement: public, authenticated, role/scope, or service-to-service.
- Object-level authorization is tested, not assumed from route-level middleware.
- Inputs are validated before use in queries, filesystem paths, shell commands, outbound URLs, or templates.
- SQL uses parameterization or ORM query builders.
- Error responses do not reveal stack traces, tokens, existence of private objects, or provider secrets.
- Logs redact tokens, cookies, API keys, passwords, PII, and secret-bearing URLs.
- Rate limits protect auth, password reset, invite, OTP, and expensive endpoints.
- Security-sensitive changes include regression tests.

## Common Mistakes

- Confusing `401` and `403` in a way that leaks private resource existence.
- Checking role but not ownership or tenant.
- Trusting client-provided user IDs, org IDs, prices, roles, or scopes.
- Logging full request headers or auth provider responses.
- Accepting JWTs without issuer/audience checks.
- Adding broad admin bypasses without audit logs and tests.
