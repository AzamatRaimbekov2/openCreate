---
type: decision
status: current
updated: 2026-06-02
sources:
  - ../../AGENTS.md
  - ../../agent-assets/prompt-refiner/SKILL.md
  - ../../agent-assets/prompt-refiner/agents/openai.yaml
  - ../../tools/install-agent-assets.ps1
  - ../../tools/test-install-agent-assets.ps1
  - ../../tools/test-template-project.ps1
  - ../../tools/test-global-prompt-refiner.ps1
tags:
  - project-docs
  - wiki/decision
  - agents
  - skills
---

# Prompt Refinement Required

## Decision

Every user prompt should start with `prompt-refiner`: Codex rewrites the raw
message into a clear internal working request before planning, answering,
editing files, running tools, or loading downstream skills.

## Rationale

Many prompts in this workspace are intentionally fast, informal, mixed-language,
or broad. A mandatory refinement step preserves the user's intent while turning
the request into concrete goals, targets, constraints, deliverables, and
verification steps.

## Scope

- Global install: `C:/Users/User/.codex/skills/prompt-refiner`.
- Project-local source: `agent-assets/prompt-refiner/`.
- Installed project rule: target `AGENTS.md` gets a `Prompt Refinement` section
  through `tools/install-agent-assets.ps1`.
- Template rule: `Template Project/AGENTS.md` and `Template Project/AgentMD.md`
  list `prompt-refiner` first in the startup chain.

## Important Limit

A normal Codex skill cannot intercept a message before Codex receives it. This
decision configures prompt refinement as the first agent workflow step after
the user message is received, not as a pre-model transport filter.

## Verification

```powershell
python C:\Users\User\.codex\skills\.system\skill-creator\scripts\quick_validate.py agent-assets\prompt-refiner
python C:\Users\User\.codex\skills\.system\skill-creator\scripts\quick_validate.py C:\Users\User\.codex\skills\prompt-refiner
powershell -NoProfile -ExecutionPolicy Bypass -File tools\verify-agent-assets.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tools\test-install-agent-assets.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tools\test-template-project.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tools\test-global-prompt-refiner.ps1
```
