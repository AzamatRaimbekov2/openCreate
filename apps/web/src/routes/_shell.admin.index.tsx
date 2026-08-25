// apps/web/src/routes/_shell.admin.index.tsx
// The operator dashboard ('/admin'). Session-guarded like every other in-app
// screen, and role-gated one layer deeper.
//
// The role check is NOT in beforeLoad, on purpose. A guard that redirects a
// non-admin away makes the page indistinguishable from a 404, and the person
// most likely to land here wrongly is the operator themselves — signed into the
// wrong account. Letting the screen render its own 403 tells them which of the
// two problems they have. The actual wall is server-side (requireSuperAdmin
// re-reads user.role on every request), so nothing is protected by the redirect
// that isn't already protected without it.
//
// ADR: docs/wiki/decisions/analytics.md
import { createFileRoute } from '@tanstack/react-router'
import { AdminDashboard } from 'modules/Analytics'
import { requireSession, useMe } from 'modules/Auth'

export const Route = createFileRoute('/_shell/admin/')({
  beforeLoad: () => requireSession(),
  component: AdminPage,
})

function AdminPage() {
  const me = useMe()

  return (
    <main className="flex w-full flex-col gap-8 px-6 py-8 xl:px-10">
      <AdminDashboard
        isSuperAdmin={me.data?.role === 'super_admin'}
        // While /api/me is in flight the answer is UNKNOWN, not "no" — rendering
        // the 403 first and replacing it with the dashboard a moment later reads
        // as a permission flicker and makes the operator doubt the page.
        isSessionLoading={me.isPending}
      />
    </main>
  )
}
