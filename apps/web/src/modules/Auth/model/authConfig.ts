// apps/web/src/modules/Auth/model/authConfig.ts
// Public runtime auth-provider flags. The Auth module reads this to decide which
// optional sign-in buttons (Google) to render — from the SERVER's real config
// (GET /api/auth/config), so the client can never drift from what is actually
// wired. Replaces the old build-time VITE_GOOGLE_AUTH flag (ADR google-oauth).
import type { AuthConfig } from '@opencreate/contracts'
import { useQuery } from '@tanstack/react-query'
import { api } from 'shared/libs/apiClient'

export function useAuthConfig() {
  return useQuery({
    queryKey: ['auth-config'],
    queryFn: () => api<AuthConfig>('/api/auth/config'),
    // Provider enablement only changes on a redeploy — cache for the session so
    // the auth screen never flickers the button and never re-fetches on remount.
    staleTime: Infinity,
  })
}
