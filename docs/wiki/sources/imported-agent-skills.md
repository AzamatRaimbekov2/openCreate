---
type: source
status: current
updated: 2026-06-03
sources:
  - https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/tree/main/.claude/skills/ui-ux-pro-max
  - https://github.com/Shubhamsaboo/awesome-llm-apps/tree/main/awesome_agent_skills/code-reviewer
  - https://github.com/affaan-m/ECC/tree/main/.agents/skills/backend-patterns
  - ../../agent-assets/ui-ux-pro-max/SKILL.md
  - ../../agent-assets/code-reviewer/SKILL.md
  - ../../agent-assets/backend-patterns/SKILL.md
tags:
  - project-docs
  - wiki/source
  - skills
---

# Imported Agent Skills

## Source

Three public GitHub skill folders were imported as stable local copies:

- `ui-ux-pro-max` from `nextlevelbuilder/ui-ux-pro-max-skill`
- `code-reviewer` from `Shubhamsaboo/awesome-llm-apps`
- `backend-patterns` from `affaan-m/ECC`

## Imported Artifacts

- `agent-assets/ui-ux-pro-max/`: `SKILL.md`, OpenAI metadata, real `data/`
  CSV resources, and `scripts/` search/design-system helpers. The upstream
  `.claude/skills/ui-ux-pro-max/data` and `scripts` entries point at
  `src/ui-ux-pro-max/`; this repository stores the actual target directories so
  the skill works inside `agent-assets/`.
- `agent-assets/code-reviewer/`: `SKILL.md`, OpenAI metadata, source
  `AGENTS.md` review guide, and detailed `rules/` files for security,
  performance, correctness, and maintainability.
- `agent-assets/backend-patterns/`: `SKILL.md` and upstream OpenAI metadata for
  backend architecture, API, database, caching, auth, rate limiting, jobs, and
  logging patterns.

## Local Adaptation

- `ui-ux-pro-max/SKILL.md` command examples were adapted from
  `skills/ui-ux-pro-max/scripts/search.py` to
  `agent-assets/ui-ux-pro-max/scripts/search.py`.
- `ui-ux-pro-max` and `code-reviewer` received local `agents/openai.yaml`
  metadata because the upstream folders did not include it.
- Root and project-local `AGENTS.md` rules route UI/UX work to
  `ui-ux-pro-max`, review work to `code-reviewer`, and backend/API work to
  `backend-patterns`.

## Verification

Run:

```powershell
python C:\Users\User\.codex\skills\.system\skill-creator\scripts\quick_validate.py agent-assets\ui-ux-pro-max
python C:\Users\User\.codex\skills\.system\skill-creator\scripts\quick_validate.py agent-assets\code-reviewer
python C:\Users\User\.codex\skills\.system\skill-creator\scripts\quick_validate.py agent-assets\backend-patterns
python agent-assets\ui-ux-pro-max\scripts\search.py "dashboard analytics" --domain chart -n 1
powershell -NoProfile -ExecutionPolicy Bypass -File tools\verify-agent-assets.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tools\test-install-agent-assets.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tools\test-template-project.ps1
```
