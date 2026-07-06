# eslint.config.js — AI component doc

> AI-facing sidecar for `eslint.config.js`. Created 2026-07-06. Keep this in sync with the code on every change.

## Purpose
Flat ESLint config for `@opencreate/contracts` so the package's `lint` script (`eslint src`) runs. Same baseline the plan mandates for apps/api: typescript-eslint recommended + `no-explicit-any` as error (workspace "zero any" rule).

## What it does (for an AI reader)
- Responsibilities: configure ESLint (v10 flat config) for the package's TS sources.
- Public API / exports: default export — `tseslint.config(recommended, { rules })` array.
- Inputs → Outputs: lints `src/**/*.ts` → violations reported by `pnpm --filter @opencreate/contracts lint`.
- Side effects: none (config only).

## Dependencies
- Imports / depends on: `typescript-eslint` (dev dep).
- Used by: package `lint` script; root `pnpm lint` (recursive).

## Diagram
```mermaid
flowchart LR
  CLI[pnpm lint] --> CFG[eslint.config.js] --> SRC[src/*.ts violations]
```

## Key decisions / gotchas
- Plan Task 2 didn't list a config for contracts but its `lint` script requires one under ESLint flat-config; added the api-baseline config + `typescript-eslint` dev dep (recorded as a deviation).

## Commits
- _no commit yet_
