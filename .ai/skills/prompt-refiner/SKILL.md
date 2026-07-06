---
name: prompt-refiner
description: Mandatory prompt clarification and task-shaping workflow. Use at the start of every user request, especially rough, emotional, short, typo-heavy, mixed-language, under-specified, or broad prompts, before planning, editing files, running tools, answering, or delegating to other skills.
---

# Prompt Refiner

## Overview

Turn the user's raw message into a clear working request before acting. Preserve the user's intent, language, urgency, and constraints while making the task specific enough for reliable execution.

This skill runs inside Codex after the user message is received. It cannot technically intercept a message before Codex sees it, but it must be the first reasoning step before any substantive answer or tool use.

## Mandatory Startup Behavior

For every user request:

1. Identify the raw intent, target artifact, success criteria, constraints, and missing context.
2. Rewrite the request as a `Refined Prompt` for internal execution.
3. Keep the scope conservative. Do not add expensive, risky, destructive, legal, financial, security, deployment, or credential-related work unless the user explicitly asked for it.
4. If missing context is discoverable from the workspace, inspect the workspace instead of asking first.
5. Ask a concise clarification only when a reasonable assumption would likely produce the wrong result or create risk.
6. Act on the refined prompt using all project rules and relevant skills.

## Output Rules

- Do not force the user to approve the refined prompt for normal tasks.
- Keep the refined prompt internal unless showing it would help alignment, the request is broad, or the user asked to improve a prompt.
- When showing it, use a short block titled `Refined Prompt`, then continue with the work.
- Preserve direct user commands. If the user says "do it", "fix it", or "run it", do not turn that into only advice.
- Preserve emotional signal as priority information, not as wording to repeat back.
- Preserve safety boundaries and project rules over the refined prompt.

## Refinement Checklist

Use this checklist silently:

- Goal: What should be true when the task is done?
- Target: Which project, file, page, feature, branch, service, or tool is affected?
- Deliverable: Code change, design, documentation, command output, explanation, test, deployment, or review?
- Quality bar: Production-ready, quick fix, prototype, visual polish, accessibility, mobile, tests, docs?
- Constraints: Existing stack, project rules, deadlines, language, no destructive actions, no secret leaks?
- Verification: Which tests, builds, browser checks, screenshots, or manual checks prove it?
- Communication: Should progress be shown, should assumptions be stated, should the refined prompt be visible?

## Examples

Raw: `make the site beautiful`

Refined Prompt: Improve the existing site's UI into a production-quality responsive experience. Inspect the current project, follow local frontend/design rules, choose a clear visual direction that fits the product, implement the changes, run the dev server, verify desktop and mobile layouts, fix obvious visual issues, and summarize changed files and checks.

Raw: `run the project properly`

Refined Prompt: Discover the project's package manager and start command, run the app on an available local port, resolve startup blockers when safe, then provide the working URL and any remaining issues.

Raw: `push everything to git`

Refined Prompt: Review git status, identify the intended change set, avoid committing secrets or unrelated user changes, run relevant verification, then stage, commit, push, and report the branch or PR only after each operation succeeds.

Raw: `check why it does not work`

Refined Prompt: Reproduce the failure from the user's context, inspect logs and relevant code, identify the root cause before changing code, add or update a failing test when source behavior changes, implement the smallest fix, rerun targeted and relevant broader checks, and explain the cause and verification.
