---
type: source
status: current
updated: 2026-06-03
sources:
  - https://claude.com/plugins
  - ../../agent-assets/claude-plugin-directory.config.json
  - ../../agent-assets/claude-plugin-directory/plugins/
tags:
  - project-docs
  - wiki/source
  - claude-plugins
---

# Claude Plugin Directory

## Source

The public Claude Plugins directory at `https://claude.com/plugins` lists
plugins for Claude Code and Claude Cowork. The directory page says plugins
bundle tools, skills, and integrations for one-click installation.

## Imported Artifact

- `agent-assets/claude-plugin-directory.config.json`
- `agent-assets/claude-plugin-directory/plugins/`
- `Template Project/agent-assets/claude-plugin-directory.config.json`
- `Template Project/agent-assets/claude-plugin-directory/plugins/`

The registry captures 100 directory entries from the public page as catalog
metadata: slug, name, URL, works-with targets, verification status, install
count, short directory description, local package path, and keyword-derived
capability hints for `plugin`, `mcp`, and `skill`.

Each registry entry also has a physical package folder under
`agent-assets/claude-plugin-directory/plugins/<slug>/` and the same folder
mirror in `Template Project`. Each package contains `manifest.json`,
`README.md`, `.claude-plugin/plugin.json`, `capabilities/plugin.json`, and
MCP/skill capability files when applicable.

## Constraints

- Entries are disabled by default.
- Credentials, OAuth grants, API tokens, and local machine secrets are not
  stored in the registry or package folders.
- Capability hints are based on public directory card text and should be
  verified against each plugin's manifest or target installation environment
  before use.

## Verification

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\verify-agent-assets.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tools\test-install-agent-assets.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tools\test-template-project.ps1
```
