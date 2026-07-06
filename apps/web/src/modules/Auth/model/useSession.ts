// apps/web/src/modules/Auth/model/useSession.ts
// Session + profile hooks. useAuthSession wraps better-auth's session store;
// useMe layers our ledger-accurate profile (/api/me: id, email, name,
// creditsBalance) on top with TanStack Query, only firing when signed in.
import { useQuery } from '@tanstack/react-query'
import type { Me } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'
import { authClient } from './authClient'

// Thin wrapper so components/routes depend on the module, not on better-auth
export function useAuthSession() {
  return authClient.useSession()
}

// Profile from OUR API — the balance comes from the credit ledger, not the
// session payload, so it is always accurate after charges/refunds.
export function useMe() {
  const session = useAuthSession()
  return useQuery({
    // Shared key: Credits' BalanceChip reads the same cache entry and AuthForm
    // invalidates it after login/registration
    queryKey: ['me'],
    queryFn: () => api<Me>('/api/me'),
    // Without a session /api/me can only 401 — don't fire the request at all
    enabled: Boolean(session.data),
    staleTime: 30_000,
  })
}
