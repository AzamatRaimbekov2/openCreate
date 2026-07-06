# TransactionsList.tsx — AI component doc

> AI-facing sidecar for `TransactionsList.tsx`. Created 2026-07-06. Keep this in sync with the code on every change.

## Purpose

The credit-history modal opened from `BalanceChip`: last 100 ledger rows with localized
kind labels and signed, colored amounts.

## What it does (for an AI reader)

- Responsibilities: render the 4 UI states inside a `Modal` (skeleton rows / ErrorState
  with retry / EmptyState / rows); format dates per active locale.
- Public API / exports / props / endpoints: `TransactionsList({ isOpen, onClose })`,
  `TransactionsListProps`. Private `TransactionRow` subcomponent.
- Inputs → Outputs: `isOpen` gates the `useTransactions` query → dialog listing
  `credits.kinds.*` labels, `Intl.DateTimeFormat` dates, `+n`/`-n` amounts
  (`text-success` / `text-danger`).
- Side effects (I/O, network, state): GET `/api/credits/transactions` while open (via
  `useTransactions`); none while closed.

## Dependencies

- Imports / depends on: `react-i18next`, `@opencreate/contracts` (`CreditTransaction`),
  `shared/ui` (Modal, Skeleton, ErrorState, EmptyState), `../model/creditsApi`.
- Used by: `components/BalanceChip.tsx`; exported through the module `index.ts`.

## Diagram

```mermaid
flowchart LR
  BC[BalanceChip click] -->|isOpen| TL[TransactionsList]
  TL --> Q[useTransactions]
  Q -->|pending| SK[3 skeleton rows]
  Q -->|error| ES[ErrorState + retry]
  Q -->|empty| EM[EmptyState]
  Q -->|data| RW[TransactionRow xN]
```

## Key decisions / gotchas

- The query is `enabled: isOpen` — a closed modal renders nothing AND requests nothing.
- Amount sign is explicit text (`+200` / `-35`); color only reinforces it (a11y rule:
  status is never color-only, design.md §7).
- Dates format with `i18n.language`, so switching EN↔RU re-renders dates correctly.
- Kind labels come from `credits.kinds.<kind>` keys — adding a ledger kind requires new
  locale entries in BOTH en.json and ru.json.

## Commits

- _no commit yet_
