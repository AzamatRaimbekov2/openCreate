---
type: source
status: current
updated: 2026-05-28
sources:
  - ../raw/next-js/next-js-better-auth-integration-SKILL.md
  - ../raw/next-js/next-js-better-auth-integration-skill-report.json
  - ../raw/next-js/next-js-16-launchpad-SKILL.md
  - ../raw/next-js/next-js-16-launchpad-skill-report.json
  - ../raw/next-js/next-js-patterns-SKILL.md
  - ../raw/next-js/next-js-patterns-skill-report.json
tags:
  - project-docs
  - wiki/source
  - frontend
  - nextjs
---

# Next.js Skill Sources

## Source Set

- `next-js-better-auth-integration`: conceptual Better Auth integration guide for Next.js App Router authentication, sessions, JWT, protected routes, providers, hooks, security, and tests.
- `next-js-16-launchpad`: Next.js 16 launch/migration guide covering Turbopack, Cache Components, `proxy.ts`, App Router, React 19, streaming, cache tags, Server Actions, security, and deployment.
- `next-js-patterns`: concise Next.js App Router patterns for pages, layouts, `next/link`, `next/navigation`, server/client components, data fetching, fonts, and metadata.
- Each imported skill includes a `skill-report.json`; all reports mark the skills as safe documentation resources with no critical/high/medium/low findings.

## Key Claims

- Prefer App Router for Next.js apps, with pages at `app/[route]/page.tsx` and layouts at `app/layout.tsx` or nested route layouts.
- Server Components are the default in `app/`; use `"use client"` only when hooks, state, effects, event handlers, or browser APIs are required.
- Next.js navigation uses `next/link` and `next/navigation` inside Next.js App Router apps.
- Next.js 16 source says Turbopack is default, `cacheComponents` replaces older PPR flags, `proxy.ts` replaces `middleware.ts` for Node-runtime request boundaries, and request APIs such as `params` should be awaited.
- Cache Components use `'use cache'`, `cacheLife`, `cacheTag`, and Suspense boundaries; runtime APIs such as cookies/headers should be read outside cached scopes and passed in.
- Server Actions should validate input and use cache invalidation such as `updateTag` where appropriate.
- Better Auth integration should initialize providers/adapters, configure secure sessions/JWT, expose session state to client and server components, and protect routes through Next.js request boundaries.
- Authentication must account for secure cookies, CSRF, validation, rate limiting, secret management, session invalidation, and auth-flow tests.

## Tensions To Preserve

- This project previously chose TanStack Router as the default router for generic new frontend work. These Next.js sources are framework-specific: use App Router conventions when a project is explicitly Next.js.
- The `next-js-patterns` source mentions SWR/TanStack Query as optional for Client Components. This project standard remains TanStack Query for client-side server state; Server Components may fetch directly when the data stays server-rendered.
- `next-js-16-launchpad` contains time-sensitive version guidance. Verify current official Next.js docs before applying version-specific migration steps in a live project.
