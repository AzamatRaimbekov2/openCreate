---
name: behaviour-harness
description: Verify functional correctness of a change — the behaviour harness. Use whenever a task adds or changes product behaviour, a feature, an API endpoint, a user flow, business logic, a bug fix, or anything with observable outcomes. Enforces explicit acceptance criteria, layered behaviour sensors (contract/e2e/property), mutation-tested tests, and an independent LLM-as-judge check before "done".
---

# Behaviour Harness

## Why this exists

Per harness engineering (Böckeler), the **behaviour harness** — proving the code does the right thing — is the weakest, most underdeveloped category, and teams **over-rely on AI-generated test quality**. Green tests do not prove correct behaviour: AI tends to write happy-path tests that assert the implementation rather than the requirement. This skill closes that gap with feedforward **guides** (acceptance criteria) and feedback **sensors** (layered tests + mutation + an independent judge).

Use it together with `test-driven-development` (mechanics) and `verification-before-completion` (final gate). This skill owns *behavioural* correctness specifically.

## The loop (do in order)

### 1. Guide — write acceptance criteria FIRST (feedforward)
Before any code, write explicit, testable criteria in **Given / When / Then** form, including failure, edge, permission/security, and regression cases. Store them in the nearest `FEATURE.md` (or a `TESTCASES.md`) using `assets/TESTCASES.template.md`. Every criterion gets a stable ID (`BH-1`, `BH-2`, …). This is the contract the change is judged against — not the implementation.

### 2. Sensors — build layered behaviour tests (not just unit)
Map **every** acceptance criterion to at least one automated test. Cover, as applicable to the stack:
- **Unit / integration** — core logic and collaborators (via `test-driven-development`).
- **Contract** — API request/response against the schema/OpenAPI (shape, status codes, error envelope). Backend changes that touch a contract MUST have one.
- **End-to-end** — the affected user flow (frontend) or API flow (backend), happy + at least one failure path.
- **Property-based** — for invariants/ranges/round-trips where inputs vary (e.g. `fast-check`, `hypothesis`), instead of a few hand-picked examples.
Write them failing first, then implement. Frontend tests in JS/TS, backend tests in Python, matching the project's existing stack.

### 3. Sensor — validate the tests themselves with mutation testing
Coverage % is not trust. Run **mutation testing** on the changed code so the tests are proven to catch regressions (kills the "happy-path AI test" failure mode):
- JS/TS → StrykerJS, Python → `mutmut`/`cosmic-ray`, others → the stack's mutation tool.
- Triage every **surviving mutant**: either add/strengthen a test or justify it in writing. Do not silently ignore survivors.

### 4. Run the sensors (keep quality left)
```bash
bash .claude/skills/behaviour-harness/assets/behaviour-check.sh
```
Stack-aware, best-effort: runs the test suite, type/lint checks, and (if a mutation tool is configured) mutation testing, reporting what ran and what is missing. Fast computational sensors first; expensive ones after.

### 5. Inferential sensor — independent judge
Dispatch the **`behaviour-judge`** subagent (Agent tool). It adversarially checks the implementation + diff + test results against each acceptance criterion: looks for uncovered criteria, happy-path-only tests, assertions on implementation instead of behaviour, missing error/permission paths, and unkilled mutants. It returns a verdict + concrete gaps. It does not edit code.

### 6. Gate
Behaviour work is **not done** until:
- every acceptance criterion (`BH-n`) maps to a test that failed before and passes after,
- mutation survivors on changed code are killed or justified,
- the `behaviour-judge` verdict is **pass** (or all raised gaps are resolved),
- the criteria checklist is recorded in `FEATURE.md`/`TESTCASES.md`.

## Notes
- If the project has no test/mutation harness, add the smallest one first (see `test-driven-development`); if unsafe, document the blocker and ask before changing production code.
- This is a behaviour harness; pair with `code-reviewer`/`backend-code-review` (maintainability/security sensors) and design-system/architecture checks for full coverage.
