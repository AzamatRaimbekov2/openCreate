---
type: source
status: current
updated: 2026-06-03
sources:
  - https://github.com/tirth8205/code-review-graph
  - ../../agent-assets/code-review-graph/manifest.json
  - ../../agent-assets/code-review-graph/.mcp.json
  - ../../agent-assets/code-review-graph/skills/review-pr/SKILL.md
tags:
  - project-docs
  - wiki/source
  - mcp
  - code-review
---

# Code Review Graph Plugin

## Source

`tirth8205/code-review-graph` is a local-first knowledge graph for
token-efficient code review through MCP and CLI. The local bundle was imported
from commit `0c9a5ff3371cf78f89032ff6936e3d3a5fedf0b8`, version `2.3.5`.

## Imported Artifact

- `agent-assets/code-review-graph/`
- `Template Project/agent-assets/code-review-graph/`

The bundle includes upstream source code, tests, docs, hooks, skills,
`pyproject.toml`, `uv.lock`, and `.mcp.json`. Local wrapper manifests were added
under `manifest.json`, `.codex-plugin/plugin.json`, and
`.claude-plugin/plugin.json` so the project can validate and copy the bundle as
a template asset.

## MCP

The included `.mcp.json` defines:

```json
{
  "mcpServers": {
    "code-review-graph": {
      "command": "uvx",
      "args": ["code-review-graph", "serve"]
    }
  }
}
```

MCP client registration, authentication, and machine-specific paths stay
outside this repository.

## Skills

- `build-graph`
- `debug-issue`
- `explore-codebase`
- `refactor-safely`
- `review-changes`
- `review-delta`
- `review-pr`

## Verification

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\verify-agent-assets.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tools\test-install-agent-assets.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tools\test-template-project.ps1
```
