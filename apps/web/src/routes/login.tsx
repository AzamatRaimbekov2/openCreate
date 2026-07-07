// apps/web/src/routes/login.tsx
// Login/registration screen ('/login') — a standalone screen (no AppShell) in
// the v3 terminal treatment (stage 3): ONE centered steel card (#1d293d, 8px
// radius) on the flat void, with the mono wordmark above it as the way back
// home. Composition only: the Auth module owns the form. Signed-in visitors
// are forwarded to /create.
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { AuthForm, useAuthSession } from 'modules/Auth'
import { Skeleton } from 'shared/ui'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

// Shared centered frame so the pending and form states keep one silhouette:
// the wordmark home link over the steel card. Elevation is the surface color
// step (void → steel) — no shadow, per the design law.
function LoginFrame({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-void px-6 py-12">
      {/* Mono wordmark = the escape hatch back to the landing. The portal-blue
          middle dot is decorative — the accessible name stays "openCreate". */}
      <Link
        to="/"
        className="rounded-lg text-xl font-medium text-white focus-visible:ring-2 focus-visible:ring-portal focus-visible:outline-none"
      >
        openCreate
        <span aria-hidden="true" className="text-portal">
          ·
        </span>
      </Link>
      {/* The card: one steel surface step on the void, standard white/10
          hairline + 8px radius — the login sheet reads like a Modal at rest */}
      <div className="w-full max-w-md rounded-lg border border-white/10 bg-steel p-8">
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

  // Session resolution is async — mirror the card's silhouette instead of
  // flashing the form; the same holds briefly before the redirect above
  if (session.isPending || isSignedIn) {
    return (
      <LoginFrame>
        <Skeleton className="h-80 w-full" />
      </LoginFrame>
    )
  }

  return (
    <LoginFrame>
      <AuthForm />
    </LoginFrame>
  )
}
