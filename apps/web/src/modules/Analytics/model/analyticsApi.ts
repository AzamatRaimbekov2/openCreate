// apps/web/src/modules/Analytics/model/analyticsApi.ts
// Read hooks for the analytics endpoints (ADR: docs/wiki/decisions/analytics.md).
//
// All four are plain windowed GETs, so the window is part of the query key —
// switching 7d → 30d must fetch, not silently re-render the old numbers under a
// new label, which is the one way a dashboard can lie without being wrong.
import { useQuery } from '@tanstack/react-query'
import type { AdminHealth, AdminMoney, AdminUsers, MeUsage } from '@opencreate/contracts'
import { api } from 'shared/libs/apiClient'

// The windows the UI offers. Kept here rather than in the component so the
// picker and the query key can never disagree about what is selectable.
export const WINDOW_OPTIONS = [1, 7, 30, 90] as const
export type WindowDays = (typeof WINDOW_OPTIONS)[number]

// 60s: this data is aggregates over hours and days, and a dashboard that
// refetches on every focus change costs a full table scan to show the same
// number. Long enough to be cheap, short enough that an operator watching a
// failing model sees it recover.
const STALE_MS = 60_000

function adminQuery<T>(key: string, path: string, days: WindowDays, enabled: boolean) {
  return {
    queryKey: ['analytics', key, days] as const,
    queryFn: () => api<T>(`${path}?days=${days}`),
    // Never fire for a non-admin: the answer can only be a 403, and a guaranteed
    // failure in the cache makes the error state flash on every mount.
    enabled,
    staleTime: STALE_MS,
    // A 403 does not become a 200 by asking again.
    retry: false,
  }
}

export function useAdminHealth(days: WindowDays, enabled: boolean) {
  return useQuery(adminQuery<AdminHealth>('health', '/api/admin/analytics/health', days, enabled))
}

export function useAdminMoney(days: WindowDays, enabled: boolean) {
  return useQuery(adminQuery<AdminMoney>('money', '/api/admin/analytics/money', days, enabled))
}

export function useAdminUsers(days: WindowDays, enabled: boolean) {
  return useQuery(adminQuery<AdminUsers>('users', '/api/admin/analytics/users', days, enabled))
}

// Every signed-in user, scoped to themselves by the server. No `enabled` gate on
// a role — the only requirement is a session, which the route already guarantees.
export function useMyUsage(days: WindowDays) {
  return useQuery({
    queryKey: ['analytics', 'me-usage', days] as const,
    queryFn: () => api<MeUsage>(`/api/me/usage?days=${days}`),
    staleTime: STALE_MS,
  })
}
