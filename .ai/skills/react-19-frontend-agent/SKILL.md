---
name: react-19-frontend-agent
description: Use when creating, editing, reviewing, or planning React 19 frontend applications, routes, screens, dashboards, UI sections, component architecture, TypeScript frontend structure, TanStack Router, TanStack Query, Zustand state, shadcn fallback components, modular frontend architecture, or deciding whether a React project should use Next.js.
---

# React 19 Frontend Agent

## Overview

Build React frontends as production systems, not loose component demos. Use React 19, TypeScript routing, small files, deliberate state boundaries, and Next.js only when the app genuinely needs server rendering or static generation.

## Project References

Load these references when the task touches the matching area:

- `references/frontend-architecture.md` for the current modular architecture, `shared` rules, dependency boundaries, TanStack Router/Query, Zustand, Next.js mode, linting, and bundle rules.
- `references/frontend-guardrails.md` for the project-level architecture decision.
- `references/project-react-patterns.md` for component, hook, state, performance, error, TypeScript, and testing patterns.
- `references/project-next-js-patterns.md` for Next.js App Router, Server/Client Components, Cache Components, Better Auth, metadata, and verification.
- `references/ui-components-governance.md` for project component sourcing and shadcn fallback rules.

## Project-Local Chain

When this skill is used inside a project with `agent-assets/`, treat the local bundle as authoritative:

- Start with `agent-assets/project-documentation-wiki/SKILL.md` and the project wiki startup loop.
- Route general frontend decisions through `agent-assets/frontend/skills/frontend-agent/SKILL.md`.
- Run `agent-assets/frontend/skills/frontend-error-ux/SKILL.md` during frontend initialization so 404, error modal, crash fallback, and offline no-internet blocker behavior is checked before feature work.
- Use this skill and its sub-skills for React 19, routing, React patterns, and Next.js-specific work.
- Keep newly created skills, OpenAI agent metadata, and rule/reference files inside the current project's `agent-assets/` folder.

## Required Sub-Skills

- Use `react-19-patterns` for component boundaries, reconciliation, state, Hooks, Actions, forms, Suspense, and performance.
- Use `typescript-react-routing` whenever adding sections, pages, navigation, URL state, route params, layouts, or router setup.
- Use `nextjs-app-router-practices` only when the project uses Next.js or the task requires SSR, SSG, RSC, route metadata, streaming, server actions, or server-side data access.

## Stack Decision

Prefer the existing project stack. For a new React SPA, default to React 19, TypeScript, TanStack Router, TanStack Query, and Zustand only for small client-only cross-screen state.

Use Next.js only when at least one is true:

- SEO, metadata, social previews, or first paint depends on server-rendered content.
- Pages need SSR, SSG, ISR, RSC, streaming, or server-only data access.
- The project already uses Next.js App Router.
- File-system routing and deployment target are intentional product requirements.

Do not choose Next.js just because the task says "frontend", "dashboard", "app", or "site".

When the selected framework is Next.js, use Next.js App Router conventions instead of TanStack Router for route files and navigation. Keep TanStack Query for client-side server state where the app needs interactive client cache/mutation workflows.

## Non-Negotiables

- React app code must target React 19. If the repo is on React 18 or lower, flag the mismatch before expanding the app.
- New routing work must be TypeScript. Use `.tsx` and `.ts` for route, page, layout, and router files.
- Every new user-facing section must have a route or documented route integration. Avoid orphan page components that are not reachable from navigation or router config.
- New SPA routing work uses TanStack Router unless the existing repo has another router and migration is out of scope.
- Client-side server state uses TanStack Query. Do not mirror server data into Zustand or React context.
- URL-addressable state belongs in router search params where practical.
- Zustand is the maximum global client-state manager and must stay small, typed, and client-only.
- Use project-owned or skill-provided UI components first; use shadcn/ui as fallback only when no suitable project component exists.
- Keep `shared` for domain-agnostic primitives and infrastructure. Do not put module-owned API calls, query keys, business rules, feature stores, forms, filters, or workflow state in `shared`.
- Modules do not deep-import from other modules. Cross-module access goes through public `index.ts` only and should be documented.
- A component file must stay at or below 200 physical lines. Split before crossing the limit.
- Every created component must follow the `react-19-patterns` component contract: single responsibility, typed explicit props, KISS by default, pragmatic DRY, and SOLID boundaries where they reduce coupling.
- Repeated UI or behavior must be extracted to a separate component, hook, utility, or feature-local primitive instead of being copied across files.
- Avoid many unrelated `useState` calls in one component. Use derived values, reducer state, custom hooks, URL state, or smaller child components.
- Keep render pure: no side effects, random values, dates, subscriptions, DOM writes, or async work directly in render.

## Implementation Workflow

1. Inspect `package.json`, router/framework files, `tsconfig`, lint config, and existing route layout.
2. Confirm React 19 compatibility and whether TypeScript already exists.
3. Choose SPA React/TanStack Router or Next.js App Router using the stack decision above.
4. Design route ownership before component coding.
5. Build route modules first, then page composition, then leaf components and hooks.
6. Split files as soon as a component mixes layout, data orchestration, interaction logic, and repeated UI.
7. Extract repeated component patterns immediately when the second real use appears; keep shared abstractions small and typed.
8. Reuse documented UI components/tokens first; use shadcn fallback only after checking project and active skill components.
9. Update wiki, frontend docs, and local feature docs for durable behavior, architecture, UI, route, component, or design-system changes.
10. Run typecheck/lint/tests and, for visual work, inspect desktop and mobile in a browser when practical.

## File Boundaries

Use feature folders unless the repo has a stronger convention:

```text
src/
  app/                 # router setup, providers, app shell
  modules/<module>/    # business modules, components, model, api, lib, public index
  routes/ or pages/    # route-facing screens depending on framework
  shared/              # domain-agnostic primitives and infrastructure
```

Route components compose; leaf components render. Hooks own stateful behavior. Reducers own multi-action state transitions. Utilities stay framework-agnostic.

## Completion Checklist

- React 19 assumptions are explicit.
- New sections are routed and navigable.
- TypeScript is used for all routing changes.
- SPA routing, server state, URL state, and client-only state follow TanStack Router, TanStack Query, and Zustand guardrails.
- `shared` and module public APIs follow the project dependency rules.
- Project UI components were reused before shadcn or bespoke markup.
- Error UX startup audit has checked the 404 page, blocking error modal/dialog, crash fallback, and offline no-internet blocker.
- No component file exceeds 200 lines.
- Created components follow DRY, KISS, and practical SOLID rules.
- Repeated UI or behavior was extracted into separate typed files.
- State ownership is local, derived, URL-based, or reducer-backed.
- Effects only synchronize external systems.
- Next.js was either justified or deliberately avoided.
- Verification commands were run or the reason they could not run is stated.
