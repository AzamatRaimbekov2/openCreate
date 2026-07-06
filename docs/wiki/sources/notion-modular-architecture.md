---
type: source
status: current
updated: 2026-05-28
sources:
  - https://hexagonal-bloom-600.notion.site/108cee89104380168e26de4339af991e
  - https://hexagonal-bloom-600.notion.site/Routing-79d5cd9f37dd499bb94d66f9f8df27f5
  - https://hexagonal-bloom-600.notion.site/Prettier-0500824682dd4d119d7a7448d8a63626
  - https://hexagonal-bloom-600.notion.site/ESLint-React-TypeScript-f82570302bdb43889fa51e626bd72ece
  - https://www.figma.com/board/Bmnpl58uDdjqsQDoasAsIh/Modular?node-id=0-1&node-type=canvas
tags:
  - project-docs
  - wiki/source
  - architecture
  - frontend
---

# Notion Modular Architecture Source

## Source Set

- Main Notion page: "Модульная архитектура".
- Linked Notion page: "Routing".
- Linked Notion page: "Prettier".
- Linked Notion page: "Настройка ESLint для React + TypeScript проекта".
- Linked FigJam board: "Modular" architecture diagram.

## Key Claims

- The frontend should follow a modular, FSD-like layout under `src` with `@types`, `app`, `modules`, `routes`, and `shared` as primary boundaries.
- Feature/business modules belong under `modules/<ModuleName>/` and should expose their public surface through `index.ts`.
- Shared reusable assets, utilities, global model/state, types, config, and UI belong under `shared/`.
- Route definitions are centralized and modularized under `app/routes`, while concrete screen components live under `pages` in the Routing example.
- Vite config should be split into builder helpers such as `buildPlugins`, `buildResolve`, `buildServer`, `buildOptions`, `buildCss`, `buildTest`, and related functions.
- Import aliases are expected for `shared`, `app`, `modules`, and a legacy or route-facing `pages` alias.
- The project standard in the source doc is Node `20.17.*` and Yarn `1.22.*`, enforced with `only-allow yarn`.
- Quality gates include TypeScript checking, ESLint, Prettier, Stylelint, Husky hooks, and optionally `jscpd`/commit message checks.
- Prettier style is no semicolons, single quotes, trailing commas, two-space tabs, one JSX attribute per line, LF line endings, and import sorting.
- ESLint guidance favors ESLint 9 flat config for React + TypeScript with React hooks, accessibility, Prettier, naming, and strict TypeScript rules.

## Links Captured

- Main page section anchors: "Файловая структура", "Package.json", "Husky", "Eslint", "Prettier".
- Main page internal pages: "Routing", "Prettier", "Настройка ESLint для React + TypeScript проекта".
- External diagram: Figma/FigJam "Modular".

## Tensions To Preserve

- The main page describes `routes/` as pages/routes and keeps a `pages` alias pointed at `src/pages`, while the Routing page uses both `app/routes` and `pages`.
- The main page enforces Yarn via `only-allow yarn`; the linked ESLint page also lists Bun install/run alternatives. Treat Yarn as the project default unless a repository-specific package manager says otherwise.
- ESLint examples include older `.eslintrc.json`/Airbnb guidance and multiple ESLint 9 flat-config variants. Prefer current repo config when present, then use the flat-config guidance as the architectural target.
