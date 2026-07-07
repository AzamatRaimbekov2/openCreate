// apps/web/src/modules/Credits/components/TransactionsList.tsx
// Credit history modal. Implements all 4 UI states inside the dialog:
// skeleton rows → ErrorState with retry → EmptyState → transaction rows with
// localized kind labels and signed amounts (success/danger colored).
import { useTranslation } from 'react-i18next'
import type { CreditTransaction } from '@opencreate/contracts'
import { EmptyState, ErrorState, Modal, Skeleton } from 'shared/ui'
import { useTransactions } from '../model/creditsApi'

export type TransactionsListProps = {
  // Controlled by the owner (BalanceChip) — the modal fetches only while open
  isOpen: boolean
  // Called on Escape, overlay click, and the close button
  onClose: () => void
}

export function TransactionsList({ isOpen, onClose }: TransactionsListProps) {
  const { t } = useTranslation()
  // Query is disabled while closed: no hidden background traffic
  const { data, isPending, isError, refetch } = useTransactions(isOpen)

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('credits.history')}>
      {isPending ? (
        // Three row-shaped skeletons mirror the eventual list silhouette
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : isError ? (
        <ErrorState message={t('errors.loadFailed')} onRetry={() => void refetch()} />
      ) : data.items.length === 0 ? (
        <EmptyState title={t('credits.empty.title')} description={t('credits.empty.description')} />
      ) : (
        // Terminal ledger: white/10 hairline-divided rows, no hover chips —
        // the modal's steel sheet is the surface, the rules are the structure
        <ul className="flex max-h-96 flex-col divide-y divide-white/10 overflow-y-auto">
          {data.items.map((transaction) => (
            <TransactionRow key={transaction.id} transaction={transaction} />
          ))}
        </ul>
      )}
    </Modal>
  )
}

// One ledger row: localized kind + date on the left, signed amount on the right
function TransactionRow({ transaction }: { transaction: CreditTransaction }) {
  const { t, i18n } = useTranslation()
  const isPositive = transaction.amount > 0
  // Locale-aware date — follows the active i18n language, not the browser's
  const date = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(transaction.createdAt))
  return (
    // One ledger line on the hairline grid — the v1 hover chip is retired; a
    // read-only row should not pretend to be interactive
    <li className="flex items-center justify-between gap-4 px-1 py-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-mist">
          {t(`credits.kinds.${transaction.kind}`)}
        </span>
        <span className="text-xs text-mist-dim">{date}</span>
      </div>
      {/* Sign is explicit (+/-) — color reinforces it but never carries it
          alone. Triad status glows (v3 §2): positive = glow-green (the
          succeeded family), negative = glow-red; weight 400 per the ceiling. */}
      <span
        className={`text-lg leading-none font-normal ${isPositive ? 'text-glow-green' : 'text-glow-red'}`}
      >
        {isPositive ? `+${transaction.amount}` : String(transaction.amount)}
      </span>
    </li>
  )
}
