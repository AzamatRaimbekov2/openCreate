---
type: source
status: current
updated: 2026-05-28
sources:
  - ../raw/react-patterns/layout-kit-lobehub-react.md
  - ../raw/react-patterns/react-patterns-skill.md
tags:
  - project-docs
  - wiki/source
  - frontend
  - react
---

# React Patterns Source

## Source Set

- `docs/wiki/raw/react-patterns/layout-kit-lobehub-react.md`: LobeHub-oriented React component conventions, layout rules, styling rules, and desktop sync notes.
- `docs/wiki/raw/react-patterns/react-patterns-skill.md`: General modern React patterns for component design, hooks, state, React 19, composition, performance, errors, TypeScript, tests, and anti-patterns.

## Key Claims

- Components should stay small, focused, and composable, with one responsibility per component.
- Prefer props down and events up; use context or global state only when the ownership scope needs it.
- Extract hooks only when logic is reused or clearly complex enough to justify a named abstraction.
- Put state at the narrowest useful scope: local state, lifted parent state, subtree context, URL/search state, server-state cache, then global client store.
- Profile before optimizing; use virtualization for large lists and targeted memoization for measured expensive work.
- Use error boundaries at app, route/feature, and risky-component scopes with fallback UI, logging, retry, and data preservation.
- Type component props, event handlers, children, refs, and reusable generic components explicitly.
- Test user-visible behavior, edge cases, error states, and accessibility.
- For LobeHub-style projects, prefer `src/components`, then `@lobehub/ui/base-ui`, then `@lobehub/ui`, then `antd`, with custom implementation last.
- For LobeHub-style layout, use `Flexbox` and `Center`, prefer `gap` over margins, and use `flex={1}` for fill behavior.

## Tensions To Preserve

- The LobeHub source says SPA navigation should use `react-router-dom`. This does not replace this project's default TanStack Router rule for new frontend work; treat it as an app-specific rule for LobeHub-style codebases.
- The LobeHub source names `antd` as a late fallback. This does not replace this project's shadcn fallback; use `antd` only when a project-specific skill or existing codebase already chooses it.
- The general React patterns source mentions React Query or SWR for server state and Redux Toolkit for complex global state. This project standard narrows that to TanStack Query for server state and Zustand as the maximum client-state manager.
