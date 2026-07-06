---
name: sidecar-docs
description: Keep an AI-facing sidecar .md next to every code file and detailed intent comments in the code. Use whenever you create or change a frontend/backend source file. A PostToolUse hook scaffolds the sidecar automatically; this skill defines what goes in it and the in-code comment policy.
---

# Sidecar Docs

Every source file carries a sibling Markdown doc and well-commented code, so an AI (or human) can understand any file without reading the whole codebase.

## The rule

1. **Sidecar per code file.** For a source file `X.ext`, keep `X.ext.md` **at the same level** (same directory). The `sidecar-docs` PostToolUse hook (`.claude/hooks/sidecar-docs.cjs`) creates a stub automatically when you write a new code file — **you must fill it** in the same task. When you change the file, **update its sidecar**.
2. **Detailed in-code comments on change.** When you create or modify code, leave comments that explain **intent (why), not just what** — non-obvious decisions, invariants, edge cases, trade-offs, and links to the ADR / FEATURE / sidecar. Match the file's existing comment style and density; don't narrate trivial lines.

Applies to source files (`.ts/.tsx/.js/.jsx/.py/.go/.rb/.php/.java/.kt/.rs/.vue/.svelte/...`). Not to tests, type decls, generated/vendored code, config, or `.md` themselves.

## What the sidecar must contain
- **Purpose** — what the file/component is and why it exists.
- **What it does (for an AI reader)** — responsibilities; public API / exports / props / endpoints; inputs → outputs; side effects (I/O, network, state).
- **Dependencies** — what it imports/depends on, and what uses it.
- **Diagram** — a Mermaid diagram of the file's role/flow (component, sequence, or flowchart). Reuse the cookbook in `.claude/skills/feature-architecture/assets/diagrams.md`.
- **Key decisions / gotchas** — anything non-obvious.
- **Commits** — append the commit hash + subject when the change is committed (the hook seeds the latest commit when available).

## Workflow when you touch code
1. Write/modify the code with detailed intent comments.
2. The hook ensures `X.ext.md` exists (or you create it). Fill/refresh every section to match the new code, including the Mermaid diagram.
3. Record the commit in the sidecar's Commits section after committing.
4. For feature-level structure, link the sidecar to the feature's `FEATURE.md` and the relevant ADR (`docs/wiki/decisions/`).

## Keep it true
A stale sidecar is worse than none. If you can't keep it accurate, fix it in the same change. The sidecar is AI memory for that file — treat it as part of the code.

> Disable the auto-scaffold by removing the `sidecar-docs.cjs` entry from `.claude/settings.json` (PostToolUse). The rule still applies; only the automatic stub creation stops.
