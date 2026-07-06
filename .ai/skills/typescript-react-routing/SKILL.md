---
name: typescript-react-routing
description: Use when adding or changing React routes, page sections, navigation, route params, URL search state, route layouts, router setup, lazy route modules, or TypeScript frontend app structure.
---

# TypeScript React Routing

## Overview

Every user-facing React section needs a typed route, reachable navigation, and explicit URL ownership. Do not create standalone page components that the app cannot navigate to.

## Hard Rules

- New routing code must be TypeScript: `.ts` or `.tsx`.
- If a project has no TypeScript setup and the task creates routing, add or propose TypeScript setup before adding routes.
- Every new section must update the router config, navigation surface, route constants/types, and tests where the repo has them.
- Route components must stay below 200 lines and mostly compose feature components.
- URL params and search params must be parsed and typed before use.
- Use URL/search params for shareable filters, tabs, selected entities, pagination, and sort state.

## Router Selection

Use the existing router first. For a new React SPA, choose a router with nested layouts, lazy route modules, route params, navigation links, and data-loading integration appropriate to the project. If the team already uses React Router or TanStack Router, follow that ecosystem instead of introducing a second router.

Choose Next.js routing only through `nextjs-app-router-practices`.

## Recommended SPA Shape

```text
src/app/router.tsx
src/app/routes.ts
src/app/AppShell.tsx
src/features/<feature>/routes/<FeaturePage>.tsx
src/features/<feature>/components/
src/features/<feature>/hooks/
src/features/<feature>/types.ts
```

Keep route paths centralized when the router does not generate typed routes:

```ts
export const routes = {
  home: "/",
  dashboard: "/dashboard",
  project: (projectId: string) => `/projects/${projectId}`,
} as const;
```

## Route Implementation Checklist

1. Add the route path and route module.
2. Add a navigation link or explain why the route is intentionally deep-linked only.
3. Type route params and search params.
4. Put data loading at the route boundary when the router supports it.
5. Keep route-level state in the URL when it affects navigation, sharing, reloads, or browser history.
6. Split feature UI into small components and hooks before the page file exceeds 200 lines.
7. Add error, loading, and empty states where the route fetches data.
8. Run typecheck and a navigation smoke test.

## Common Mistakes

- Creating `DashboardPage.tsx` but never registering `/dashboard`.
- Storing tab/filter/page state only in `useState` when it should survive reload or be shareable.
- Parsing `params.id` as a string everywhere instead of validating once at the route boundary.
- Duplicating path strings across buttons, nav, breadcrumbs, and tests.
- Adding a second router because it is convenient for one feature.
