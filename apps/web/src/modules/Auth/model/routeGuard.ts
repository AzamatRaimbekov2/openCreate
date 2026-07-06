// apps/web/src/modules/Auth/model/routeGuard.ts
// TanStack Router beforeLoad guard for auth-only routes (/create, /library).
// Lives in the Auth module so routes depend on 'modules/Auth', never on
// better-auth directly — the provider stays swappable in one place.
import { redirect } from '@tanstack/react-router'
import { authClient } from './authClient'

// Resolve the session on the auth server; signed-out visitors are bounced to
// /login BEFORE the protected screen mounts (no flash of private UI).
export async function requireSession(): Promise<void> {
  const { data } = await authClient.getSession()
  if (!data) throw redirect({ to: '/login' })
}
