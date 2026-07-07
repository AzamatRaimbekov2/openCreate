// apps/web/src/routes/login.tsx
// Login/registration screen ('/login') — a standalone screen (no AppShell) in
// the v3 terminal split: mono manifesto block on the abyss step left, the form
// on the void right (design.md §11). Composition only: the Auth module owns
// both columns' content. Signed-in visitors are forwarded to /create.
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { AuthForm, AuthManifesto, useAuthSession } from 'modules/Auth'
import { Skeleton } from 'shared/ui'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

// Shared split frame so the pending and form states keep one silhouette:
// manifesto column (abyss step) + centered right column. On mobile the
// manifesto stacks above as a compact block; from lg it is the fixed left page.
function LoginSplit({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-screen bg-void lg:grid-cols-[5fr_7fr]">
      <AuthManifesto />
      <div className="flex items-start justify-center px-6 py-12 lg:items-center lg:py-16">
        {children}
      </div>
    </main>
  )
}

function LoginPage() {
  const navigate = useNavigate()
  const session = useAuthSession()
  const isSignedIn = Boolean(session.data)

  // Already signed in (or just signed in via AuthForm) — the form has nothing
  // to offer; go create. Typed navigation: /create exists since Task 16, so
  // the earlier router.history escape hatch is gone as promised.
  useEffect(() => {
    if (isSignedIn) void navigate({ to: '/create', replace: true })
  }, [isSignedIn, navigate])

  // Session resolution is async — mirror the form column's silhouette instead
  // of flashing the form; the same holds briefly before the redirect above
  if (session.isPending || isSignedIn) {
    return (
      <LoginSplit>
        <Skeleton className="h-96 w-full max-w-md" />
      </LoginSplit>
    )
  }

  return (
    <LoginSplit>
      <AuthForm />
    </LoginSplit>
  )
}
