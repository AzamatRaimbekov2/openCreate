# React 19 Review Checklist

Use this when reviewing a React component or feature:

1. Confirm the project uses React 19 or the change explicitly addresses an upgrade path.
2. Count component file lines. Split before 200 lines.
3. Check every created component for one responsibility, explicit typed props, and KISS-level simplicity.
4. Find repeated UI or behavior. Extract repeated components, hooks, or utilities into separate files at the second real use.
5. Confirm DRY and SOLID boundaries reduce coupling instead of creating speculative abstractions.
6. Identify every state variable. Remove derived state, group related state, or extract a reducer/hook.
7. Inspect keys in lists and conditional subtrees. Require stable IDs and intentional resets.
8. Inspect every Effect. It must synchronize with an external system and clean up after itself.
9. Check that event logic stays in event handlers and render stays pure.
10. Check Suspense, Actions, `useActionState`, `useOptimistic`, or `useTransition` when async UI has manual pending/error/optimistic state.
11. Check context scope. High-frequency state should not sit in broad providers.
12. Run typecheck, lint, tests, and browser verification when the project supports them.
