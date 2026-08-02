# eslint.config.js — AI component doc

> AI-facing sidecar for `eslint.config.js`. Created 2026-07-28. Keep this in sync with the code on every change.

## Purpose
Flat ESLint config for `@opencreate/mcp` so the package's `lint` script (`eslint src test`) runs. Same baseline as `apps/api` and `packages/contracts`: typescript-eslint recommended + `no-explicit-any` as error (workspace "zero any" rule).

## What it does (for an AI reader)
- Responsibilities: configure ESLint (v10 flat config) for the package's TS sources and tests.
- Public API / exports / props / endpoints: default export — `tseslint.config(recommended, { rules })` array.
- Inputs → Outputs: lints `src/**/*.ts` + `test/**/*.ts` → violations reported by `pnpm --filter @opencreate/mcp lint`.
- Side effects (I/O, network, state): none (config only).

## Dependencies
- Imports / depends on: `typescript-eslint` (already a dev dep of the package).
- Used by: package `lint` script; root `pnpm lint` (recursive).

## Diagram
```mermaid
flowchart LR
  CLI[pnpm -r lint] --> eslint_config[eslint.config.js] --> OUT[src + test violations]
```

## Key decisions / gotchas
- The package shipped in 373b51f with a `lint` script but no config. Under ESLint v10 flat config a missing `eslint.config.js` is a HARD ERROR, not a skip — so `pnpm -r lint` exited 2 for the whole workspace and masked the other packages' reports. Adding the config was the fix; no rule was relaxed to make it pass.
- Deliberately a copy of the api/contracts config rather than a shared preset: three copies of four lines cost less than a fourth workspace package, and the baseline is one rule deep.

## Commits
- _no commit yet_
