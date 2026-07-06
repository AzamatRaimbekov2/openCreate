---
name: react-19-patterns
description: Use when writing, refactoring, or reviewing React 19 components, hooks, state logic, forms, async UI, Suspense boundaries, performance behavior, reconciliation behavior, component extraction, DRY/KISS/SOLID boundaries, or component file structure.
---

# React 19 Patterns

## Overview

Write React 19 code that stays friendly to reconciliation, compiler optimization, concurrent rendering, and human maintenance.

## Component Rules

- Keep each component file at or below 200 physical lines.
- One file should have one primary exported component. Move subcomponents to sibling files once they grow beyond tiny render helpers.
- Do not define components inside another component render body. It changes identity and can reset state.
- Keep route/page components mostly compositional. Move repeated UI to components and stateful behavior to hooks.
- Prefer props that describe intent over broad object bags that force child components to know parent internals.

## Component Creation Contract

- Apply KISS first: build the smallest clear component that solves the current UI need.
- Apply DRY pragmatically: extract repeated markup, styling patterns, behavior, or data shaping after the second real use, not from speculation.
- Apply SOLID as React boundaries: single responsibility per component, dependency inversion through props/callbacks, and open extension through composition instead of flag-heavy components.
- Give every reusable component explicit typed props, a narrow purpose, and a stable file name that matches the exported component.
- Move repeated components into their own files. Feature-specific repeats stay in the feature folder; cross-feature primitives move to `shared` or the repo's existing shared component area.
- Prefer composition over boolean prop explosions. If a component gains many mode flags, split it into specialized components or slots.
- Keep business logic out of presentational components unless the component owns that interaction locally.
- Do not duplicate list items, cards, buttons, form rows, empty states, loading states, or layout shells across routes. Extract them.

## Reconciliation Rules

- Treat component state as tied to tree position and component identity.
- Use stable domain IDs as keys. Do not use array indexes for reorderable, filterable, insertable, or user-editable lists.
- Use a deliberate `key` to reset state when switching between conceptually different records, tabs, users, drafts, or route entities.
- Do not change component types at the same tree position unless a reset is intended.
- Keep conditional branches structurally stable when preserving child state matters.

## State Rules

- Store the minimum source of truth. Derive everything else during render.
- If a component needs more than three unrelated `useState` calls, split the component or extract a reducer/custom hook.
- If updates must happen together or depend on action history, use `useReducer`.
- Put addressable navigation state in the URL, not only in React state.
- Keep form draft state close to the form. Lift it only when another component truly owns it.
- Do not mirror props into state unless the component intentionally creates an editable draft.

## Effects and Purity

- Render must be idempotent and free of side effects.
- Use event handlers for user-caused work. Use Effects only to synchronize with external systems.
- Do not use Effects to calculate derived display data, reset state from props, or handle click/submit consequences.
- Every Effect should have a clear external system: network subscription, DOM integration, timer, storage, analytics, or imperative widget.
- Clean up subscriptions, timers, observers, and in-flight async work.

## React 19 APIs

- Use Actions for async mutations that need pending, error, and optimistic behavior.
- Prefer `useActionState` for form-like mutations and `useOptimistic` for reversible optimistic UI.
- Use `useTransition` for non-blocking UI updates, route-like transitions, and async actions where responsiveness matters.
- Use Suspense boundaries around async or lazy UI that can load independently.
- Keep React Compiler compatibility in mind: pure components, static component definitions, immutable props/state, and no hidden render side effects.

## Performance Rules

- Measure or identify the rendering pressure before adding memoization.
- Prefer smaller component boundaries and stable data flow over blanket `memo`, `useMemo`, and `useCallback`.
- Split contexts by update frequency and domain. Avoid putting high-churn state in a broad app-wide context.
- Use virtualization for large lists instead of trying to memoize thousands of DOM nodes.
- Keep expensive calculations pure and memoize only when inputs are stable and the calculation is non-trivial.

## Review Checklist

- File is at or below 200 lines.
- Component has one responsibility and explicit typed props.
- Repeated UI/behavior was extracted into separate files at the second real use.
- DRY, KISS, and practical SOLID boundaries were applied without speculative abstraction.
- Keys preserve or reset state intentionally.
- State is minimal, grouped, and not redundant.
- Effects are external synchronization only.
- Component identity is stable.
- React 19 Actions/Suspense/Transitions are used where they reduce manual state.
- TypeScript types describe public props and reducer actions.
