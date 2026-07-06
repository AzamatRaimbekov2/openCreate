# Behaviour acceptance criteria — <feature/change name>

> Written BEFORE implementation. Each criterion is the contract the change is judged against.
> Give each a stable ID and map it to the test(s) that prove it. Keep this file next to the feature.

## Context
- Goal:
- Affected flow / endpoint / module:
- Out of scope:

## Acceptance criteria (Given / When / Then)

| ID | Given | When | Then | Test(s) | Status |
|----|-------|------|------|---------|--------|
| BH-1 | <precondition> | <action> | <expected observable outcome> | `path/to/test::name` | ☐ |
| BH-2 | | | | | ☐ |

### Required coverage classes (add rows above for each that applies)
- Happy path
- Failure / invalid input / error envelope
- Edge / boundary values
- Permission / authorization / tenant isolation (if security-relevant)
- Idempotency / concurrency (if applicable)
- Regression for the specific bug (if a fix)

## Sensors run
- [ ] Unit / integration
- [ ] Contract (API schema / status codes / error shape)
- [ ] End-to-end (affected user/API flow, happy + ≥1 failure)
- [ ] Property-based (invariants), where inputs vary
- [ ] Mutation testing on changed code — survivors killed or justified below

### Surviving mutants (triage)
| Mutant / location | Decision (test added / justified) |
|---|---|
| | |

## Judge verdict
- behaviour-judge: ☐ pass / ☐ gaps (list below)
-
