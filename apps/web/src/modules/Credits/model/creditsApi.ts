// apps/web/src/modules/Credits/model/creditsApi.ts
// TanStack Query hooks of the Credits module: the ledger-accurate balance
// (shared ['me'] cache entry) and the credit transaction history.
import { useQuery } from '@tanstack/react-query'
import type { CreditTransaction, Me } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'

// Wire shape of GET /api/credits/transactions (contracts creditTransactionListSchema)
export type CreditTransactionList = {
  // Last 100 ledger rows, newest first
  items: CreditTransaction[]
}

// Balance comes from /api/me — deliberately the SAME ['me'] query key the Auth
// module uses, so login invalidation and future refund invalidations update
// the chip without any cross-module import.
export function useBalance() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api<Me>('/api/me'),
    staleTime: 30_000,
  })
}

// History is fetched only while the modal is open (isEnabled) and refetched on
// every open — each generation/refund adds rows, stale history is misleading.
export function useTransactions(isEnabled: boolean) {
  return useQuery({
    queryKey: ['creditTransactions'],
    queryFn: () => api<CreditTransactionList>('/api/credits/transactions'),
    enabled: isEnabled,
    staleTime: 0,
  })
}
