---
name: nextjs-app-router-practices
description: Use when creating, editing, reviewing, or deciding on Next.js App Router projects, SSR, SSG, Server Components, Client Components, route groups, layouts, metadata, loading/error boundaries, or typed Next.js routes.
---

# Next.js App Router Practices

## Overview

Use Next.js deliberately. App Router is powerful when server rendering, static generation, metadata, RSC, streaming, or server-only data access matters; it is unnecessary weight for many pure client apps.

## When to Use Next.js

Use Next.js when the task needs one or more of:

- SSR, SSG, ISR, streaming, or React Server Components.
- SEO-critical pages, route metadata, sitemap, Open Graph, or social preview generation.
- Server-only database/API access, secrets, or mutations.
- File-system routing and layouts as a product/team requirement.
- An existing Next.js App Router codebase.

Avoid Next.js for small client-only dashboards, internal tools, prototypes, games, or embedded widgets unless the repo already uses it.

## App Router Rules

- Use the `app/` directory with `layout.tsx`, `page.tsx`, and route segments.
- Keep pages and layouts as Server Components by default.
- Add `"use client"` only at the smallest boundary that needs state, event handlers, Effects, browser APIs, or custom client hooks.
- Use route groups like `(marketing)` or `(dashboard)` to organize without changing URLs.
- Use `loading.tsx`, `error.tsx`, `not-found.tsx`, and Suspense boundaries for data routes.
- Use `generateMetadata` or static `metadata` for SEO-visible routes.
- Use `generateStaticParams` when statically generating dynamic routes.
- Keep `page.tsx` and client component files under 200 lines.

## TypeScript Page Pattern

In current App Router docs, dynamic `params` can be asynchronous. Prefer explicit page prop types:

```tsx
type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  return <main>{id}</main>;
}
```

Check the installed Next.js version before applying version-specific conventions.

## Server and Client Boundaries

- Fetch server data in Server Components when possible.
- Pass serializable data to Client Components.
- Put forms/mutations in Server Actions only when the project has the needed deployment/runtime support.
- Keep providers as deep as possible so static server-rendered layout stays optimizable.
- Do not import server-only modules into Client Components.

## Project Organization

```text
app/
  (dashboard)/
    dashboard/
      page.tsx
      loading.tsx
      error.tsx
  layout.tsx
src/
  features/<feature>/
  shared/
```

Colocate route-only components inside the route segment. Move reusable UI and business logic into `src/features` or `src/shared` following the repo convention.

## Completion Checklist

- Next.js usage is justified by SSR/SSG/RSC/metadata/server needs or existing project stack.
- Route segment, layout, loading, error, and not-found behavior are considered.
- Client boundaries are minimal.
- Params/search params are typed and parsed.
- Metadata exists for SEO-visible pages.
- Page and component files stay under 200 lines.
- `next lint`, typecheck, tests, and browser smoke checks run when available.
