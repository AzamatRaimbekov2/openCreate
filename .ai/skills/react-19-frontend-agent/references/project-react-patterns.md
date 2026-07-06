---
type: concept
status: current
updated: 2026-05-28
sources:
  - ../sources/react-patterns-source.md
tags:
  - project-docs
  - wiki/concept
  - frontend
  - react
---

# React Patterns

## Component Design

- Keep components small and single-purpose.
- Separate display from orchestration when it improves clarity: presentational components receive props, container/route components own data loading and workflow wiring.
- Prefer composition over inheritance and slot/children-based APIs over rigid prop explosions.
- Use props down and events up for local ownership; avoid reaching into global state for simple parent-child communication.

## Hooks

- Custom hooks must start with `use`, run hooks only at the top level, and clean up effects on unmount.
- Extract a hook when behavior repeats, stateful logic becomes noisy inside a component, or a concept deserves a name.
- Keep one-off view logic local unless extracting it reduces meaningful complexity.

## State Placement

- Single component state: `useState` or `useReducer`.
- Parent-child shared state: lift state up.
- Subtree state: context, only when many descendants need the same data/actions.
- URL-addressable state: TanStack Router search params.
- Server state: TanStack Query.
- Cross-screen client-only state: small Zustand stores.
- Do not mirror TanStack Query server data into Zustand or context.

## React 19 Notes

- Use `useActionState` for form submission state where the app stack supports it.
- Use `useOptimistic` for optimistic UI that is local to a user action.
- Treat compiler-era memoization as a reason to keep components pure and simple, not as permission to skip profiling.

## Composition Patterns

- Use compound components for flexible primitives such as tabs, accordion, menu, dialog, and dropdown-like UI.
- Prefer custom hooks for reusable logic.
- Use render props only when the consumer needs control over rendering.
- Avoid higher-order components unless integrating old cross-cutting APIs where hooks are not enough.

## Performance

- Optimize only after a visible slowdown or profiling signal.
- For large lists, prefer virtualization before hand-tuning individual rows.
- Use `useMemo` for measured expensive calculations and `useCallback` for measured callback stability needs.
- Keep render paths pure and avoid broad global subscriptions.

## Error Handling

- Place error boundaries at root, route/feature, and risky component levels.
- Good fallback UI explains the failure, preserves user data when possible, logs the error, and offers retry or recovery.
- Data-fetching errors should flow through TanStack Query states and route-level boundaries where appropriate.

## TypeScript

- Use explicit props types for components.
- Use `type` for unions and complex compositions; interfaces are fine for straightforward props when the codebase prefers them.
- Type children as `ReactNode`, handlers with React handler types, and refs with the appropriate element type.
- Use generics for reusable typed components instead of widening to `any`.

## Testing

- Unit-test pure functions and hooks.
- Integration-test component behavior and important states.
- E2E-test critical user flows.
- Prioritize user-visible behavior, edge cases, error states, and accessibility.

## Anti-Patterns

- Giant components with mixed data, rendering, and workflow logic.
- Deep prop drilling when a route/subtree context or URL state would be clearer.
- `useEffect` for derived values that can be computed during render.
- Premature memoization without profiling.
- Array index keys for mutable lists.
- Deep imports across module boundaries.
