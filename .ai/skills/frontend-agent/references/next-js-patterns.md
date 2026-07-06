---
type: concept
status: current
updated: 2026-05-28
sources:
  - ../sources/next-js-skill-sources.md
tags:
  - project-docs
  - wiki/concept
  - frontend
  - nextjs
---

# Next.js Patterns

## Applicability

Use these rules when a project explicitly uses Next.js. For Vite/SPAs and non-Next React apps, keep using the generic modular frontend architecture and TanStack Router default.

## App Router Structure

- Pages live at `app/[route]/page.tsx` and export a default component.
- Root layout lives at `app/layout.tsx`; nested layouts live at `app/[route]/layout.tsx`.
- Layouts own route shells, fonts, metadata, and persistent navigation.
- Use `next/link` for internal navigation and `useRouter` from `next/navigation` for programmatic navigation inside Client Components.

## Server And Client Components

- Server Components are the default in the App Router.
- Use `"use client"` only for state, effects, event handlers, browser APIs, or client-only libraries.
- Keep presentational components server-side when possible.
- Client Components should be isolated leaves or interaction islands, not entire route trees by habit.

## Data Fetching And Server State

- Server Components may fetch directly with `await fetch()` or database calls when the data is rendered on the server.
- Use TanStack Query for client-side server state, async mutations, cache invalidation, optimistic updates, and interactive client workflows.
- Do not mirror server data into Zustand; use Zustand only for client-only cross-screen state.
- For Next.js Server Actions, validate inputs and invalidate related caches or tags after writes.

## Next.js 16 Notes

The imported Next.js 16 source says:

- Node.js `20.9.0+`, TypeScript `5.1.0+`, and React `19.2+` are expected.
- Turbopack is the default builder; opt out only when necessary.
- `cacheComponents: true` and `reactCompiler: true` can be configured in `next.config.ts` when the app supports them.
- `proxy.ts` is the request boundary for cross-route auth, rewrites, and redirects in the Next.js 16 guidance.
- Request APIs such as `params` are async and should be awaited.

Verify version-specific APIs against official Next.js docs before applying them in production.

## Caching And Streaming

- Use `'use cache'` for cacheable component scopes.
- Use `cacheLife()` to set cache lifetime and `cacheTag()`/`updateTag()` for tag-based invalidation.
- Do not read runtime request APIs such as cookies or headers inside cached scopes; read them first and pass values in.
- Wrap dynamic or slow sections in Suspense to stream route content.
- Prefer parallel data fetching with `Promise.all` when requests are independent.

## Authentication With Better Auth

- Initialize Better Auth with database adapters, providers, callbacks, session options, JWT settings, and secrets.
- Provide session access across server and client boundaries.
- Use request-boundary checks for protected routes and redirect unauthenticated users to login.
- Client auth hooks should expose session data, auth status, loading, errors, sign-in, sign-out, and session refresh behavior.
- Security requirements include secure HTTP-only cookies where appropriate, CSRF protection, input validation, rate limiting, secret management, and session invalidation.

## Metadata, Fonts, And SEO

- Use `export const metadata: Metadata = { ... }` in pages or layouts for route metadata.
- Use `next/font` for font optimization and apply variables/classes in layouts.
- Keep SEO metadata near the route that owns the content.

## Testing And Verification

- Test App Router page and layout behavior.
- Test Server Component data paths and Client Component interaction paths separately.
- Test authentication flows, protected routes, session persistence, session expiration, and provider errors.
- Test cache invalidation and streaming fallback states where the route depends on them.
