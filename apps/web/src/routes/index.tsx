// apps/web/src/routes/index.tsx
// Landing route ('/') — composition only: reads the session and tells the
// Landing module where its CTAs should point (/create when signed in, /login
// otherwise). The session read lives HERE because modules/Landing must not
// import modules/Auth (cross-module imports are banned).
import { createFileRoute } from '@tanstack/react-router'
import { useAuthSession } from 'modules/Auth'
import { LandingPage } from 'modules/Landing'

export const Route = createFileRoute('/')({
  component: LandingScreen,
})

function LandingScreen() {
  const session = useAuthSession()
  // While the session resolves the public page shows the visitor CTA — a
  // signed-in user just gets bounced /login → /create by the login route
  return <LandingPage ctaTo={session.data ? '/create' : '/login'} />
}
