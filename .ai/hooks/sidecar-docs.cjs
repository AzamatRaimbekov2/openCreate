#!/usr/bin/env node
/**
 * PostToolUse hook (Write|Edit|MultiEdit) — sidecar documentation harness.
 *
 * When a CODE file in a front/back project is created or changed, this hook:
 *  1. Deterministically creates a sibling "<file>.md" doc (stub) if missing —
 *     so the AI-facing doc exists "immediately, at the same level".
 *  2. Returns context telling the agent to fill/refresh that sidecar (purpose,
 *     what the file does for an AI reader, a Mermaid diagram, and the commit) and
 *     to leave detailed in-code comments explaining intent for the change.
 *
 * Never throws; always exits 0 so it can't block edits.
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

function main() {
  const raw = readStdin();
  let ev = {};
  try { ev = JSON.parse(raw || '{}'); } catch { return done(); }

  const ti = ev.tool_input || {};
  const file = ti.file_path || ti.filePath || ti.path;
  if (!file || typeof file !== 'string') return done();

  const abs = path.isAbsolute(file) ? file : path.join(ev.cwd || process.cwd(), file);
  const ext = path.extname(abs).toLowerCase();
  const base = path.basename(abs);

  const CODE = new Set(['.ts','.tsx','.js','.jsx','.mjs','.cjs','.py','.go','.rb','.php',
    '.java','.kt','.rs','.vue','.svelte','.swift','.c','.cc','.cpp','.h','.hpp','.cs','.scala']);
  if (!CODE.has(ext)) return done();

  // Skip non-source, generated, vendored, and test/doc files.
  const SKIP_DIR = /(^|\/)(node_modules|dist|build|out|\.next|\.git|coverage|vendor|__pycache__|\.venv|venv|migrations|\.claude|agent-assets)(\/|$)/;
  if (SKIP_DIR.test(abs)) return done();
  if (base.endsWith('.d.ts')) return done();
  if (/(\.|_)(test|spec)\.|(^|\/)test_|\.stories\./i.test(base)) return done();

  const sidecar = abs + '.md';            // e.g. Button.tsx -> Button.tsx.md (same level)
  const existed = fs.existsSync(sidecar);

  // Best-effort git info for the "Commits" section.
  let commit = '';
  try {
    const dir = path.dirname(abs);
    commit = cp.execSync('git -C "' + dir + '" log -1 --format="%h %ad %s" --date=short -- "' + abs + '"',
      { stdio: ['ignore','pipe','ignore'] }).toString().trim();
  } catch { /* not a repo / no history yet */ }

  if (!existed) {
    const today = new Date().toISOString().slice(0, 10);
    const stub = `# ${base} — AI component doc

> AI-facing sidecar for \`${base}\`. Created ${today}. Keep this in sync with the code on every change.

## Purpose
_What this file/component is and why it exists (one or two sentences)._

## What it does (for an AI reader)
- Responsibilities:
- Public API / exports / props / endpoints:
- Inputs → Outputs:
- Side effects (I/O, network, state):

## Dependencies
- Imports / depends on:
- Used by:

## Diagram
\`\`\`mermaid
flowchart LR
  IN[input] --> ${path.basename(abs, ext).replace(/[^A-Za-z0-9_]/g,'_')}[${base}] --> OUT[output]
\`\`\`

## Key decisions / gotchas
-

## Commits
${commit ? '- ' + commit : '- _no commit yet_'}
`;
    try { fs.writeFileSync(sidecar, stub); } catch { /* ignore */ }
  }

  const action = existed ? 'UPDATE' : 'FILL';
  const msg =
`Sidecar doc ${existed ? 'exists' : 'was scaffolded'}: ${path.relative(ev.cwd || process.cwd(), sidecar)}
${action} it now to match the code you just wrote in ${base}:
- Purpose + "what it does for an AI reader" (responsibilities, public API/props/endpoints, inputs→outputs, side effects)
- Dependencies (imports, used-by) and a Mermaid diagram of the file's role/flow
- Commits section (append the commit hash/subject once committed${commit ? '; latest: ' + commit : ''})
Also leave DETAILED in-code comments in ${base} explaining the intent of this change (why, not just what), per the sidecar-docs skill.`;

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: msg }
  }));
  process.exit(0);
}

function done() { process.exit(0); }

try { main(); } catch { done(); }
