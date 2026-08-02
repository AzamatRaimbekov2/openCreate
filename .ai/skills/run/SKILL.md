---
name: run
description: Start the openCreate dev stack (Fastify API :8787 + Vite web :5173) and open the app in the browser as soon as both are actually answering. Use when the user says "запусти проект/приложение/локально", "run the app", "открой в браузере", "покажи в браузере", "start dev", or when a change needs to be checked in the REAL app rather than in tests.
---

# Run openCreate locally

## Purpose

One command that takes the workspace from "checked out" to "the app is open in
front of the user". It starts both halves of the stack, **waits until each one
really answers**, and only then opens the browser.

The waiting is the whole point. `pnpm dev` returns a stream, not an answer — a
browser opened right after it starts lands on `ERR_CONNECTION_REFUSED`, and the
user reads that as "the app is broken" instead of "the bundler needs four more
seconds".

## When to use

- The user asks to run / start / open the project, locally or in a browser.
- A change needs to be seen working in the real app (not just green tests).
- Before manual QA, a screenshot, or a browser-driven check.

Do **not** use it to run tests — that is `pnpm test` (see the precommit gate at
the bottom).

## How to run

```bash
bash .claude/skills/run/assets/run-dev.sh
```

| Flag | Effect |
|---|---|
| _(none)_ | start (or reuse) the stack, wait for readiness, open the browser |
| `--no-open` | same, but do not steal focus — for headless verification |
| `--stop` | kill the stack this script started (whole process group) |

Run it in the **background** (`run_in_background: true`) when you intend to keep
working while it boots; it returns on its own once both ports answer, so a
foreground run is fine too and usually simpler.

## What it does

1. **Reuse check** — if `:8787/health` and `:5173` both answer, it just opens the
   browser and exits. Starting a second stack is never right: Vite silently falls
   forward to `:5174` when 5173 is taken, so the app would load while its `/api`
   calls kept hitting the *first* instance.
2. **Half-up guard** — exactly one port live means a broken session (web renders,
   every request 502s). It refuses and prints the offending pid.
3. **Preflight** — root `.env` must exist (`apps/api/src/config.ts` walks up from
   cwd to the nearest one; without it Zod fails fast on `RUNWARE_API_KEY` /
   `BETTER_AUTH_SECRET`). Installs deps if `node_modules` is missing. pnpm only.
4. **Launch** — `pnpm dev` (`--parallel` over `@opencreate/api` + `@opencreate/web`)
   detached in its own process group, logging to `$TMPDIR/opencreate-dev/dev.log`.
5. **Readiness** — polls `GET :8787/health` and `GET :5173` for up to 90s, and
   bails early with the last 40 log lines if the processes die first.
6. **Open** — `open` (macOS) / `xdg-open`, then prints both URLs, the log path and
   the stop command.

No database step is needed: `createDb()` runs an idempotent DDL bootstrap on
boot, so a fresh checkout works without `pnpm db:migrate`.

## After it opens

Optional but cheap, and it catches what a screenshot cannot: read the page's
console through the Chrome tools (`mcp__claude-in-chrome__read_console_messages`,
filtered with a `pattern`) and report real errors. Do not click through dialogs —
a JS `alert()` blocks the extension for the rest of the session.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `only part of the stack is listening` | leftover process — `--stop`, or `kill` the printed pid |
| `.env is missing` | `cp .env.example .env`, fill `RUNWARE_API_KEY` + `BETTER_AUTH_SECRET` (≥32 chars) |
| exits during startup | real error in `$TMPDIR/opencreate-dev/dev.log` (the script prints the tail) |
| app loads, every request 502s | the API half died after boot — check the same log |
| port still held after `--stop` | something started outside this script; the script lists the pids |

## Related

- Ports and the dev proxy: `apps/web/vite.config.ts` (`/api` + `/media` → `:8787`,
  same-origin so auth cookies stay first-party).
- The precommit gate is separate and does not need a running server:
  `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
