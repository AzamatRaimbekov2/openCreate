---
type: architecture
status: current
updated: 2026-05-28
sources:
  - ../sources/notion-modular-architecture.md
  - ../sources/react-patterns-source.md
  - ../sources/next-js-skill-sources.md
tags:
  - project-docs
  - wiki/architecture
  - frontend
  - modular-architecture
---

# Modular Frontend Architecture

## Intent

Use a modular, FSD-like frontend structure that keeps application composition, route definitions, feature modules, and shared primitives separated. Modules should be autonomous, testable, and imported through stable public entry points.

## Primary Layout

```text
src/
  @types/
  app/
  modules/
  routes/
  shared/
  vite.config.ts
```

- `@types/`: global declarations such as `app.d.ts` or `global.d.ts`.
- `app/`: React entry point, provider composition, app-level routing, and central application setup.
- `modules/`: independent business modules. A module may contain `components/`, `hooks/`, `model/`, `api/`, `libs/`, and `index.ts`.
- `routes/`: route-facing screen groups in the FigJam diagram; the Routing page also uses `app/routes` for route definitions.
- `shared/`: reusable cross-project code such as `ui`, `lib`, `model`, `config`, `types`, `assets`, and styles.

## Module Shape

The FigJam diagram shows a representative `modules/Sell` module:

- `components/`: `SellsTable`, `SellsChart`, `NavigateToSell`, `SellDetail`.
- `model/`: `sell.slice.ts`, module `types.ts`, `productMap.ts`.
- `api/`: API-specific config, request functions such as `getSellDetail.ts`, and an `index.ts` that re-exports API requests.
- `lib/`: module-specific helpers such as `parseSellsCount.ts` and `useSellsDataPreparation.ts`.

Each module should expose its usable surface through `index.ts` instead of leaking deep internal paths.

## Shared Admission Rules

`shared` is for stable, cross-cutting primitives, not for code that merely needs to be reached from two places during a feature build. Code can enter `shared` only when it is domain-agnostic, infrastructure-level, or reused across independent modules without carrying business ownership.

Allowed in `shared`:

- Design-system UI primitives and generic UI states such as fallback, skeleton, empty, and error surfaces.
- Generic utilities, hooks, types, constants, and formatting/parsing helpers that do not know about a business module.
- API infrastructure such as base clients, request wrappers, auth/session plumbing, and generic error normalization.
- App-wide integration helpers for libraries such as TanStack Query, TanStack Router, and Zustand when they are not tied to one domain.

Keep inside a module:

- Domain API calls, query keys, mutations, schemas, DTO mappings, and business rules.
- Feature-specific validation, selectors, stores, hooks, and component composition.
- Page-specific layout, copy, forms, tables, filters, and workflow state.
- Types used only by one module, even if they are convenient to import elsewhere.

Before moving code to `shared`, first ask whether the owning module can expose a small public API instead.

## UI Component Source Rules

Use project-owned UI components first. That means components already documented in `docs/frontend/components.md`, components already present in the codebase, and components provided by an active project UI/design skill.

If no project-owned or skill-provided component fits the need, use shadcn/ui as the default fallback component source. When using shadcn:

- Follow the shadcn skill workflow and check installed components before adding new ones.
- Use the project's package runner and existing `components.json`/aliases when present.
- Prefer shadcn variants and composition patterns over custom styled markup.
- Add generated shadcn components as source code in the repo's configured UI location, usually under `shared/ui` or the shadcn-resolved component path.
- Document any newly added reusable component in `docs/frontend/components.md`.

Custom UI markup is allowed only when neither the project UI kit nor shadcn provides a suitable primitive, or when the task intentionally requires a bespoke component.

When an active project UI skill gives a more specific component order, follow that order before shadcn. For example, LobeHub-style projects prefer `src/components`, then `@lobehub/ui/base-ui`, then `@lobehub/ui`, then `antd`, with custom implementation last. That source-specific `antd` fallback does not apply to projects that have not chosen LobeHub/Ant Design.

## Dependency Rules

- `shared` must not import from `app`, `routes`, `pages`, or `modules`.
- Modules may import from `shared` and their own internal files.
- Modules should not depend on other modules by default. If cross-module access is unavoidable, import only from the other module's public `index.ts` and document the dependency.
- Deep imports across boundaries are forbidden. Consumers import `modules/Sell`, not `modules/Sell/model/sell.slice`.
- `app` composes providers, router setup, global configuration, and app-level orchestration.
- Route/page composition may import module public APIs and `shared`, but should not reach into module internals.
- Public module exports should stay intentionally small: UI entry points, typed hooks, route adapters, and domain commands that are meant for outside use.

These rules are project guardrails and supersede loose examples from the imported Notion source when the examples conflict.

## React Implementation Patterns

Use [[react-patterns]] as the implementation-level companion to this architecture.

- Components should be small, focused, and composable.
- Keep display components prop-driven; route/container components should own data loading, mutation wiring, and workflow state.
- Extract custom hooks when logic repeats, becomes noisy, or deserves a domain name. Keep one-off view logic local.
- Put state at the narrowest useful scope: local state, lifted state, subtree context, TanStack Router search params, TanStack Query, then small Zustand stores.
- Use compound components for flexible UI primitives and custom hooks for reusable behavior.
- Profile before optimizing. Virtualize large lists and add memoization only for measured bottlenecks.
- Place error boundaries at app, route/feature, and risky component levels. Fallbacks should preserve user data when possible and provide recovery.
- During frontend initialization, run the error UX startup audit for a 404 page, blocking error modal/dialog, crash fallback, and offline no-internet blocker.
- Type props, handlers, refs, children, and reusable generics explicitly; avoid widening to `any`.
- Tests should prioritize user-visible behavior, edge cases, error states, accessibility, hooks, and critical flows.

## Routing Pattern

Route definitions are composed as arrays and exported through `app/routes/index.ts`. Nested route groups use lazy-loaded page components, `Suspense`, and a shared fallback UI.

- Example route group: `shifts -> overview -> :shiftId -> filters -> :filterId/date`.
- Route definitions can be split by segment, such as `app/routes/shifts/index.tsx`, `app/routes/shifts/shift/index.tsx`, and `app/routes/shifts/shift/filters.tsx`.
- `typedRoutes` is produced by casting the composed route array to `RouteObject[]`.
- `shared/lib/generateNavigationMap.ts` recursively turns route arrays into a typed navigation map.
- `shared/model/navigation.ts` creates `navigationMap` from `routes`.

For new frontend projects and new routing work, use TanStack Router as the default router. React Router examples in the imported source are historical guidance only unless a specific existing codebase already depends on React Router and migration is out of scope.

## Next.js Mode

When a project is explicitly Next.js, use [[next-js-patterns]] as the framework-specific companion to this architecture.

- Use Next.js App Router conventions for `app/[route]/page.tsx`, route layouts, metadata, `next/link`, and `next/navigation`.
- Treat Server Components as the default and isolate `"use client"` components to interaction islands.
- Use direct server fetch/DB calls in Server Components when data remains server-rendered.
- Keep TanStack Query as the default for client-side server state and interactive mutation/cache workflows.
- Keep Zustand limited to client-only cross-screen state.
- For Next.js 16 work, verify version-specific guidance such as Cache Components, async request APIs, and `proxy.ts` against current official Next.js docs before changing a live app.

## Data And State Rules

- Use TanStack Query for server state, async reads, mutations, caching, retries, invalidation, optimistic updates, and loading/error status.
- Query clients and app-level providers belong in `app`; domain query options, query keys, and mutation hooks belong with the owning module unless they are truly generic.
- Do not mirror server state into Zustand or React context. Read it from TanStack Query and derive view state locally.
- Use TanStack Router search params for URL-addressable state such as filters, pagination, tabs, sort, and selected IDs.
- Use local React state for component-only state.
- Use Zustand as the maximum client-state manager for cross-screen client-only state. Keep stores small, typed, and domain-owned; do not introduce Redux, MobX, or heavier state managers without a new architecture decision.

## Shared Layer

The source material treats `shared` as the home for stable reusable primitives:

- `ui/`: fallback, skeleton, error boundary, and reusable UI components.
- `lib/`: generic helpers and hooks such as `useDebounce`, date formatting/types, and navigation-map generation.
- `model/`: global state models.
- `config/`: Redux provider/store, Zustand fetcher/config, styles, Tailwind/theme config, icon packs, Ant Design theme provider/config, assets, images, fonts, and lottie.

## Tooling Standards

- Vite config is expected to delegate to helper builders: `buildDefine`, `buildPlugins`, `buildServer`, `buildResolve`, `buildCss`, `buildOptions`, `buildOptimizeDeps`, `buildEsbuild`, and `buildTest`.
- Vite aliases should cover at least `shared`, `app`, and `modules`; the docs also mention `pages` even where the folder is called `routes`.
- Prefer default Vite/Rollup chunking until bundle analysis proves a problem. Add `manualChunks` only with measured evidence, a clear reason, and a follow-up path to revisit it.
- Package constraints from the source doc: Node `20.17.*`, Yarn `1.22.*`, and `only-allow yarn`.
- Expected scripts include Vite dev/build/preview, full lint, type check, ESLint, Prettier, Stylelint, and `prepare` for Husky.
- Husky can run pre-commit checks and may add pre-push `lint`/`jscpd` plus commit-message validation.

## Formatting And Linting

- Prettier: `semi: false`, `singleQuote: true`, `trailingComma: all`, `tabWidth: 2`, `singleAttributePerLine: true`, LF endings, and sorted imports through `@trivago/prettier-plugin-sort-imports`.
- ESLint: keep one current flat config as the source of truth, preferably ESLint 9 flat config for React + TypeScript. Do not keep competing `.eslintrc`, `eslint.config.js`, and `eslint.config.mjs` variants in the same app.
- The active ESLint config should cover React hooks, JSX accessibility, Prettier integration, TypeScript rules, import sorting where repo config supports it, and architectural import boundaries.
- Preserve the repo's actual ESLint/Prettier/package-manager config when it differs from the source doc; use this architecture page as guidance, not a blind replacement.

## Bundle Splitting Rules

- Avoid hardcoded vendor chunk lists by habit. They age quickly as dependencies and route shapes change.
- Before adding or changing `manualChunks`, run bundle analysis and record what problem the split solves.
- Prefer lazy routes, lazy heavy widgets, and correct package imports before manual chunk surgery.
- If a custom chunk rule is added, comment its purpose and revisit it after dependency upgrades or major route changes.
