---
type: decision
status: current
updated: 2026-05-28
sources:
  - ../architecture/modular-frontend-architecture.md
  - ../sources/notion-modular-architecture.md
  - ../sources/react-patterns-source.md
  - ../sources/next-js-skill-sources.md
tags:
  - project-docs
  - wiki/decision
  - frontend
  - architecture
---

# Frontend Architecture Guardrails

## Decision

Adopt the imported modular frontend architecture with project-specific guardrails:

- Protect `shared` with explicit admission rules.
- Enforce dependency boundaries and public module APIs.
- Use TanStack Router for routing in new frontend work.
- Use TanStack Query for server state in all new frontend work.
- Use Zustand only for cross-screen client-only state that cannot live in local React state, TanStack Router search params, or TanStack Query.
- Use project-owned or skill-provided UI components first; fall back to shadcn/ui when no suitable project component exists.
- Use the project React patterns for component design, hook extraction, state placement, composition, performance, error boundaries, TypeScript, and tests.
- Run the project `frontend-error-ux` startup audit during frontend initialization and require 404, blocking error modal/dialog, crash fallback, and offline no-internet blocker behavior.
- Use Next.js App Router conventions when the selected framework is Next.js; otherwise keep TanStack Router as the default frontend routing choice.
- Keep a single current ESLint flat config per app.
- Treat custom `manualChunks` as measured optimization, not default setup.

## Rationale

The Notion/FigJam architecture is a strong base, but without guardrails `shared` can become a dumping ground and modules can start importing each other's internals. The project needs clear ownership, small public APIs, predictable server-state handling, and tooling that stays maintainable as dependencies change.

TanStack Router and TanStack Query provide typed routing, URL state, server-state caching, invalidation, loading/error handling, and mutation workflows without pushing server data into a global client store. Zustand remains available for small client-only stores, but heavier global state managers require a separate architecture decision.

Project-owned UI components preserve product consistency. shadcn/ui is the default fallback because it provides source-owned, composable primitives, but it should not replace existing project components or skill-provided design-system components.

React implementation patterns keep the architecture usable day to day. They define how to split components, where to place state, when to extract hooks, and how to avoid premature optimization or weak error handling.

Error UX startup checks ensure every initialized frontend has basic recovery surfaces before feature work expands the app: unknown-route recovery, blocking failure acknowledgement, crash fallback, and clear no-internet blocking when connectivity drops.

Next.js is a framework-specific mode rather than a replacement for the generic SPA rules. App Router handles route files and navigation in Next.js projects, while TanStack Query and the existing state/component guardrails still apply where they fit.

## Consequences

- New modules must define and maintain public exports intentionally.
- Cross-module imports are rare and must go through public APIs.
- Query keys, query options, mutations, and domain data transformations stay near the owning module.
- Route search state should be preferred for addressable UI state.
- UI work must check documented/project/skill components before adding shadcn or bespoke components.
- New shadcn components must be documented as project components after they are added.
- New React components should follow the component, hooks, state, performance, error, typing, and testing patterns in [[react-patterns]].
- Frontend initialization must run the frontend error UX startup audit and document or implement any missing 404, error modal, crash fallback, or offline blocker surface.
- Next.js projects should follow [[next-js-patterns]] for App Router, Server/Client Components, Cache Components, auth boundaries, metadata, fonts, and Next-specific verification.
- Legacy React Router, Redux, or multi-config ESLint setups may remain temporarily in existing apps, but new work should not expand them without an explicit migration/debt note.
- Bundle splitting work needs measurement, usually from a bundle analyzer, before custom chunk rules are added.
