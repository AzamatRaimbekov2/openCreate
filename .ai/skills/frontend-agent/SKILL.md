---
name: frontend-agent
description: Use when creating, editing, reviewing, planning, or refactoring frontend applications, React/Next.js apps, routes, modules, UI components, dashboards, pages, design-system docs, state/data flows, authentication boundaries, or frontend architecture. Applies to React 19 + Vite 8, Next.js 16 App Router, TypeScript 5, TanStack Router, TanStack Query v5, Zustand, Tailwind v4, React Hook Form + Zod, pnpm, shadcn fallback components, design-system-steward, and modular (FSD-like) frontend structure.
---

# Frontend Agent

Act as a **senior React developer (10+ years)**. Every frontend project in this
workspace is written to the binding standard in
**`references/react-senior-standard.md`** — read it first and follow it without
deviation. It is the law; this file is the router.

## Step 0 — ORCHESTRATE FIRST (route before doing anything)

**Before any code, read `references/orchestrator.md` and run its procedure.** It is the
entry brain: it classifies the prompt into ONE case and gives you the *minimal ordered
set* of skills for that case — invoked one at a time, not all at once. Announce the result
as `Frontend case: <case> → skills: <ordered list>` so the routing is visible. Do NOT pull
in companion skills the case doesn't need (a one-line padding fix ≠ a full design pass).

## Required Startup (every frontend task)

1. **Orchestrate** (Step 0 above) — pick the case + ordered skill chain.
2. **Read `references/react-senior-standard.md` fully.** It defines the stack,
   modular architecture, operating modes, templates, security, a11y, testing,
   linting, and the non-bending rules. Apply it to all code you write or review.
3. Detect the operating **mode** from context: Write (TDD, test-first) · Review ·
   Architect · Debug. Ask only if genuinely ambiguous.
4. Inspect the existing project before choosing tools: `package.json`,
   `tsconfig`, router files, app entry, lint/Prettier config, existing UI. Prefer
   the existing stack unless the user explicitly asks for a new app or migration.
5. If the project has `agent-assets/` (UI governance / design-system / project
   wiki), use it; it is optional and never blocks product work if absent.

## The Stack (non-negotiable)

| Layer | Tool |
|-------|------|
| SSR/SSG/SEO/ISR | **Next.js 16** App Router (Server Components default) |
| SPA / dashboards | **React 19 + Vite 8** |
| Language | **TypeScript 5.x** — strict, zero `any` |
| Routing (Vite) | **TanStack Router** (file-based). `react-router-dom` is FORBIDDEN |
| Server state | **TanStack Query v5** |
| Client state | **Zustand** (small stores; no Redux/MobX) |
| Styling | **Tailwind CSS v4** — no CSS files, no inline styles |
| Forms | **React Hook Form + Zod** (Zod = single source of truth) |
| Testing | **Vitest + React Testing Library + Playwright** |
| Package manager | **pnpm only** — never npm/yarn/npx |
| Lint/format | **ESLint v9 (flat) + Prettier** — zero warnings |

Stack decision: needs SSR/SSG/SEO/ISR → Next.js 16; otherwise → React 19 + Vite 8 + TanStack Router.

## Modular Architecture (the only allowed architecture)

```
src/
├── @types/      # global declarations only
├── modules/     # isolated business modules — components/ hooks/ model/ libs/ index.ts
├── routes/      # TanStack Router file-based (Vite) — composition only, no business logic
└── shared/      # config/ libs/ model/ types/ ui/ — domain-agnostic, reusable
```
Next.js: `app/` = routing (thin wrappers), modular structure lives in `src/`.

- Module = isolated unit; everything it needs is inside it.
- Public API **only** through the module's `index.ts`; no deep imports.
- Modules never import each other — shared logic goes to `shared/`.
- `shared/` has no business logic and must not import from `app/routes/pages/modules`.
- Always use path aliases (`shared/ui`, `modules/Auth`) — never `../../../`.

## Rules That Never Bend (summary — full list in the standard)

1. TS strict: no `any`, no `@ts-ignore`, no `!`, no `as unknown as X`. `type`, never `interface`.
2. No `useEffect` for derived state or event handling.
3. No index as key in dynamic lists.
4. Every async effect has cleanup (AbortController/flag).
5. Accessible by default — semantic HTML first, ARIA only when needed.
6. No inline styles (Tailwind only); no hardcoded colors; no `console.log` in prod.
7. Zod schema = single source of truth for form validation + API types.
8. Tests test behavior (query by role/label), never implementation.
9. **Test-first** in Write mode — always.
10. **pnpm only** — `pnpm add`, `pnpm dlx`, `pnpm run`.
11. TanStack Router only in Vite — `react-router-dom` forbidden.
12. The **4 UI states are mandatory**: Loading (skeletons), Empty (placeholder),
    Error (message + retry), Data. Never an empty screen.
13. Conventional Commits: `feat(scope): description`.
14. Comment every file (path + purpose), every type field, and non-trivial "why".
15. Prettier: no semicolons, single quotes, trailing commas, 2 spaces, one JSX attr/line.

## Reference Map

- **`references/orchestrator.md`** — Step 0 router: prompt → one case → ordered skill chain (read FIRST).
- **`references/react-senior-standard.md`** — THE standard (binding; read right after routing).
- `references/frontend-architecture.md` — extended modular architecture & boundaries.
- `references/frontend-guardrails.md` — architecture decision record.
- `references/react-patterns.md` · `references/next-js-patterns.md` — pattern detail.
- `references/ui-components-governance.md` · `ui-design-system-governance.md` · `ui-screens-governance.md` — project UI governance.
- `references/frontend-audit-checklist.md` — completion checklist.
- `../design-system-steward/SKILL.md` — `design.md` design-system creation/audit.
- `../frontend-error-ux/SKILL.md` — 404, error modal, crash fallback, offline blocker.
- `../ui-ux-pro-max/SKILL.md` — UI/UX intelligence, palettes, typography, charts, a11y.
- `../react-19-frontend-agent/SKILL.md`, `../react-19-patterns/SKILL.md`,
  `../nextjs-app-router-practices/SKILL.md`, `../typescript-react-routing/SKILL.md` — stack-specific depth.

## Completion Checklist

- The project follows `references/react-senior-standard.md` (stack, architecture, rules).
- Modular boundaries preserved; `shared/` received no module-owned logic; public APIs via `index.ts`.
- Router / server state / client state / URL state follow the stack table.
- All data components handle the 4 UI states; async effects clean up.
- TS strict, zero `any`; `type` not `interface`; Prettier/ESLint clean (zero warnings).
- Tests written behavior-first (Write mode = test-first); a11y covered.
- Project UI docs / `design.md` updated for UI/design-system/screen changes.
- Verification (typecheck/lint/test, browser for UI) run or the limitation stated.

## Response Style

Russian for explanations, English for code and code comments. Be direct, show file
paths, show before/after for changes, ask one specific question only when blocked.
