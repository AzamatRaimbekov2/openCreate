# ledger.ts — AI component doc

> AI-facing sidecar for `ledger.ts`. Created 2026-07-06. Keep this in sync with the code on every change.

## Purpose
Transactional credit ledger (plan Tasks 5–6). Every balance mutation happens inside the same synchronous better-sqlite3 transaction as its `credit_transaction` row, so the denormalized `user.creditsBalance` can never drift from ledger history. Implements the ADR's hold→settle/refund semantics as charge-at-submit + refund-on-failure.

## What it does (for an AI reader)
- Responsibilities: grant signup bonus; charge credits with balance check; refund a generation's charge exactly once; emit ONE structured money-path log entry per applied mutation.
- Public API / exports: `grantSignupBonus(db, userId, amount, log?)`, `chargeCredits(db, userId, amount, generationId, log?)`, `refundCredits(db, userId, generationId, log?)`, `InsufficientCreditsError` (402 / `insufficient_credits`), `MoneyLog` (structural `Pick<FastifyBaseLogger, 'info'|'warn'|'error'>`).
- Inputs → Outputs: `Db` + ids/amounts → mutated `user.creditsBalance` + inserted ledger row; `chargeCredits` throws `InsufficientCreditsError` (transaction rolls back, nothing changes).
- Side effects: db writes (always transactional) + optional log lines `credits.signup_bonus` / `credits.charge` / `credits.refund` — emitted strictly AFTER commit, and for refunds only when the balance actually moved (idempotent no-op paths stay silent).

## Dependencies
- Imports / depends on: `node:crypto` (randomUUID), `drizzle-orm` (`and`, `eq`, `sql`), `fastify` (type-only `FastifyBaseLogger`), `db/client` (`Db`), `db/schema` (`user`, `creditTransaction`).
- Used by: `modules/auth/auth.ts` (signup hook, base app logger), `modules/generations/service.ts` (charge/refund with `req.log` for reqId correlation), tests `test/ledger.test.ts`, `test/logging.test.ts`.

## Diagram
```mermaid
flowchart LR
  A[auth user.create.after] -->|grantSignupBonus| L[ledger tx]
  G[generations service] -->|chargeCredits / refundCredits| L
  L --> U[(user.credits_balance)]
  L --> T[(credit_transaction)]
```

## Key decisions / gotchas
- Invariants: balance never < 0 (checked inside the charge transaction); refund is idempotent — no charge row → no-op, existing refund row → no-op.
- `amount` is signed in the ledger: charge rows store negative, bonus/refund positive; refund amount is `-charge.amount`.
- better-sqlite3 transactions are synchronous — no `await` inside `db.transaction`.
- Money logs are audit-shaped: log line exists ⇔ ledger row exists. That is why logging happens after commit (rollback = no line) and refund logging is gated on `refunded > 0` (concurrent pollers hit the idempotent no-op path and must not fake refund entries).
- The `log` param is optional + structural (`MoneyLog`) so the ledger stays usable from non-request contexts and tests without a fastify instance.

## Commits
- 808e8e7 feat(api): better-auth (email+google) with signup bonus + /api/me
- f6f9734 feat(api): transactional credit ledger with charge/refund invariants — chargeCredits/refundCredits/InsufficientCreditsError added
- 5e8de3d feat(api): native env loading + structured logging — MoneyLog + after-commit money-path log lines
