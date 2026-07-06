// apps/web/src/routes/login.tsx
// Login/registration screen ('/login') — a standalone screen directly on paper
// (design.md §9), composition only: the Auth module owns all the logic.
// Signed-in visitors are forwarded to /create instead of seeing the form.
import { useEffect } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { AuthForm, useAuthSession } from 'modules/Auth'
import { Skeleton } from 'shared/ui'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

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

  // Session resolution is async — mirror the card's silhouette instead of
  // flashing the form; the same holds for the brief moment before redirecting
  if (session.isPending || isSignedIn) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-paper px-6">
        <Skeleton className="h-96 w-full max-w-md rounded-2xl" />
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-6">
      <AuthForm />
    </main>
  )
}
