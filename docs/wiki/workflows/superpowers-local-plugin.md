---
type: workflow
status: current
updated: 2026-06-03
sources:
  - ../../AGENTS.md
  - ../../agent-assets/superpowers/.codex-plugin/plugin.json
  - ../../agent-assets/superpowers/FEATURE.md
  - ../../tools/install-agent-assets.ps1
  - ../../tools/verify-agent-assets.ps1
  - ../../tools/test-install-agent-assets.ps1
  - ../../tools/test-template-project.ps1
tags:
  - project-docs
  - wiki/workflow
  - agents
  - plugins
  - superpowers
---

# Superpowers Local Plugin

## Purpose

`agent-assets/superpowers/` is the project-local Codex plugin mirror for
Superpowers. It makes planning, TDD, debugging, review, verification, and
delivery workflow skills travel with this template instead of depending only on
a global Codex plugin install.

## Contents

- `.codex-plugin/plugin.json`: Codex plugin manifest for Superpowers 5.1.0.
- `README.md`, `LICENSE`, `CODE_OF_CONDUCT.md`, and `assets/`: copied plugin
  metadata and visual assets from the installed Codex plugin cache.
- `skills/`: all 14 Superpowers skills and their `agents/openai.yaml`
  metadata.
- `FEATURE.md`: local project documentation for how the mirror is used and
  verified in this repository.

## Startup Usage

Project rules keep `prompt-refiner` first, then require project wiki startup.
After those project-local steps, agents should read
`agent-assets/superpowers/skills/using-superpowers/SKILL.md` and then the
specific Superpowers workflow skill that applies.

High-signal entry points:

- `test-driven-development/SKILL.md` for source-code or product-behavior
  changes.
- `systematic-debugging/SKILL.md` for defects or unclear failures.
- `verification-before-completion/SKILL.md` before claiming work complete.
- `writing-plans/SKILL.md`, `executing-plans/SKILL.md`, and
  `subagent-driven-development/SKILL.md` for planning and execution workflows.

## Installer And Template Behavior

`tools/install-agent-assets.ps1` copies the complete `agent-assets/` folder, so
Superpowers is installed into every target project automatically. The managed
`AGENTS.md` block points at the local Superpowers paths, and `Template Project/`
contains the same local plugin mirror plus `AgentMD.md` human-facing links.

## Verification

The test suite now expects:

- `agent-assets/superpowers/.codex-plugin/plugin.json` to exist.
- All 14 Superpowers skills to include both `SKILL.md` and
  `agents/openai.yaml`.
- Installed target projects and `Template Project/` to contain Superpowers.
- `AGENTS.md` and `AgentMD.md` to list the local Superpowers skill paths.

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\verify-agent-assets.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tools\test-install-agent-assets.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tools\test-template-project.ps1
```
