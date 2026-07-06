// apps/web/src/routes/_shell.tsx
// Pathless layout route: every in-app screen (create, library, pricing) renders
// inside the AppShell chrome. This is the ONLY place that wires the shell to
// the modules — AppShell itself is presentational (shared/ui must not import
// modules/*), so session state, sign-out and the BalanceChip are injected here.
import { Outlet, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { signOut, useAuthSession } from 'modules/Auth'
import { BalanceChip } from 'modules/Credits'
import { AppShell } from 'shared/ui'

export const Route = createFileRoute('/_shell')({
  component: ShellLayout,
})

function ShellLayout() {
  const session = useAuthSession()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // better-auth's name can be undefined — normalize to the shell's null contract
  const user = session.data
    ? { name: session.data.user.name ?? null, email: session.data.user.email }
    : null

  const handleSignOut = () => {
    void signOut().then(() => {
      // Personal data (me, generations, transactions) must not survive the
      // account — drop the whole cache, then land on the public page
      queryClient.clear()
      void navigate({ to: '/' })
    })
  }

  return (
    <AppShell
      user={user}
      isSessionPending={session.isPending}
      onSignOut={handleSignOut}
      // No chip when signed out — avoids a guaranteed-401 /api/me request;
      // the shell shows its Sign in action in that state instead
      balanceSlot={user ? <BalanceChip /> : undefined}
    >
      <Outlet />
    </AppShell>
  )
}
